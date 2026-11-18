import { Response } from 'express';
import { Prisma } from '@prisma/client';
import { AuthenticatedRequest } from '../../middleware/auth.middleware';
import { prisma } from '../../utils/prisma';
import { registrarAuditoria } from '../../utils/audit';
import { D, operationError } from '../../utils/operation-validation';
import { money, parseDay } from '../reportes/report-filters';
import { abonoInclude, anularAbono, documentosPorCobrar, registrarAbono, resumirTramos, TRAMOS } from './cxc-service';

// Accounts receivable: balances, statements, aging and payments (CLI-004, CLI-005, CLI-006)


// Cut-off date: end of the given day, or now
function fechaCorte(q: Record<string, unknown>) {
  const dia = parseDay(q.fechaCorte, 'fechaCorte');
  if (!dia) return new Date();
  const fin = new Date(dia);
  fin.setHours(23, 59, 59, 999);
  return fin;
}

// Aging buckets as plain numbers
const tramosJSON = (t: ReturnType<typeof resumirTramos>) => Object.fromEntries(TRAMOS.map((k) => [k, money(t[k])]));

// Per-customer summary: balance, overdue amount and available credit
export const getCuentasClientes = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const corte = fechaCorte(req.query);
  const [clientes, docs] = await Promise.all([
    prisma.customer.findMany({ orderBy: { nombre: 'asc' } }),
    documentosPorCobrar(prisma, { corte }),
  ]);
  const porCliente = new Map<string, typeof docs>();
  for (const d of docs) porCliente.set(d.customerId, [...(porCliente.get(d.customerId) ?? []), d]);
  const filas = clientes
    .filter((c) => c.creditoActivo || porCliente.has(c.id))
    .map((c) => {
      const pend = (porCliente.get(c.id) ?? []).filter((d) => d.saldo.gt(0));
      const saldo = pend.reduce((s, d) => s.plus(d.saldo), D());
      const vencido = pend.filter((d) => d.diasVencido > 0).reduce((s, d) => s.plus(d.saldo), D());
      const proximo = pend.map((d) => d.vencimiento).sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
      return {
        id: c.id, identificacion: c.identificacion, nombre: c.nombre, tipoIdentificacion: c.tipoIdentificacion,
        creditoActivo: c.creditoActivo, activo: c.activo, limiteCredito: money(c.limiteCredito), diasCredito: c.diasCredito,
        saldo: money(saldo), vencido: money(vencido), disponible: money(Prisma.Decimal.max(D(), c.limiteCredito.minus(saldo))),
        documentosPendientes: pend.length, proximoVencimiento: proximo,
      };
    });
  res.json({
    success: true,
    data: filas,
    resumen: {
      clientes: filas.length,
      conSaldo: filas.filter((f) => f.saldo > 0).length,
      saldoTotal: money(filas.reduce((s, f) => s.plus(f.saldo), D())),
      vencidoTotal: money(filas.reduce((s, f) => s.plus(f.vencido), D())),
    },
  });
};

// Customer statement: documents, payments, balance, due dates and aging (CLI-006)
export const getEstadoCuenta = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const corte = fechaCorte(req.query);
  const customer = await prisma.customer.findUnique({ where: { id: String(req.params.id) } });
  if (!customer) throw operationError('Cliente no encontrado', 404);
  const [docs, abonos] = await Promise.all([
    documentosPorCobrar(prisma, { customerId: customer.id, corte }),
    prisma.customerPayment.findMany({
      where: { customerId: customer.id, createdAt: { lte: corte } },
      include: abonoInclude,
      orderBy: { createdAt: 'desc' },
    }),
  ]);
  const saldo = docs.reduce((s, d) => s.plus(d.saldo), D());
  const vencido = docs.filter((d) => d.saldo.gt(0) && d.diasVencido > 0).reduce((s, d) => s.plus(d.saldo), D());
  res.json({
    success: true,
    data: {
      cliente: {
        id: customer.id, identificacion: customer.identificacion, nombre: customer.nombre, tipoIdentificacion: customer.tipoIdentificacion,
        contacto: customer.contacto, telefono: customer.telefono, email: customer.email,
        creditoActivo: customer.creditoActivo, limiteCredito: money(customer.limiteCredito), diasCredito: customer.diasCredito,
      },
      fechaCorte: corte,
      documentos: docs.map((d) => ({
        saleId: d.saleId, consecutivo: d.consecutivo, fecha: d.fecha, vencimiento: d.vencimiento,
        monto: money(d.montoCredito), abonado: money(d.abonado), notasCredito: money(d.notasCredito), saldo: money(d.saldo),
        diasVencido: d.saldo.gt(0) ? Math.max(0, d.diasVencido) : 0,
        estado: d.saldo.lte(0) ? 'PAGADO' : d.diasVencido > 0 ? 'VENCIDO' : 'AL_DIA',
        tramo: d.saldo.gt(0) ? d.tramo : null,
      })),
      abonos: abonos.map((a) => ({
        id: a.id, consecutivo: a.consecutivo, fecha: a.createdAt, monto: money(a.monto), estado: a.estado,
        formaPago: a.paymentMethod.nombre, referencia: a.referencia, notas: a.notas, usuario: a.usuario.nombre,
        documentos: a.aplicaciones.map((x) => `${x.sale.consecutivo} (${money(x.monto).toFixed(2)})`).join(', '),
        motivoAnulacion: a.motivoAnulacion, anuladoPor: a.usuarioAnulacion?.nombre ?? null, fechaAnulacion: a.fechaAnulacion,
        cashShiftId: a.cashShiftId,
      })),
      resumen: {
        totalCredito: money(docs.reduce((s, d) => s.plus(d.montoCredito), D())),
        totalAbonado: money(docs.reduce((s, d) => s.plus(d.abonado), D())),
        totalNotasCredito: money(docs.reduce((s, d) => s.plus(d.notasCredito), D())),
        saldo: money(saldo), vencido: money(vencido),
        disponible: money(Prisma.Decimal.max(D(), customer.limiteCredito.minus(saldo))),
        tramos: tramosJSON(resumirTramos(docs)),
      },
    },
  });
};

// Accounts receivable aging for all customers (CLI-006)
export const getAntiguedadSaldos = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const corte = fechaCorte(req.query);
  const docs = (await documentosPorCobrar(prisma, { corte })).filter((d) => d.saldo.gt(0));
  const ids = [...new Set(docs.map((d) => d.customerId))];
  const clientes = new Map((await prisma.customer.findMany({ where: { id: { in: ids } } })).map((c) => [c.id, c]));
  const filas = ids.map((id) => {
    const propios = docs.filter((d) => d.customerId === id);
    const t = resumirTramos(propios);
    const c = clientes.get(id)!;
    return {
      customerId: id, identificacion: c.identificacion, cliente: c.nombre,
      documentos: propios.length, ...tramosJSON(t),
      total: money(propios.reduce((s, d) => s.plus(d.saldo), D())),
    };
  }).sort((a, b) => b.total - a.total);
  const tot = resumirTramos(docs);
  res.json({
    success: true,
    data: filas,
    resumen: { fechaCorte: corte, clientes: filas.length, ...tramosJSON(tot), total: money(docs.reduce((s, d) => s.plus(d.saldo), D())) },
  });
};

// Records a customer payment.
export const postAbono = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const r = await registrarAbono(prisma, req.body, req.user!);
  await registrarAuditoria({
    userId: req.user?.id, accion: 'ABONO_CLIENTE', entidad: 'CustomerPayment', entidadId: r.abono.id, ip: req.ip,
    detalle: { consecutivo: r.abono.consecutivo, customerId: r.abono.customerId, monto: r.abono.monto, documentos: r.documentos, saldoAnterior: r.saldoAnterior, saldoNuevo: r.saldoNuevo },
  });
  res.status(201).json({
    success: true, message: `Abono ${r.abono.consecutivo} registrado`,
    data: { ...r.abono, saldoAnterior: money(r.saldoAnterior), saldoNuevo: money(r.saldoNuevo), documentos: r.documentos },
  });
};

// Voids a customer payment.
export const postAnularAbono = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const abono = await anularAbono(prisma, String(req.params.id), req.body, req.user!);
  await registrarAuditoria({
    userId: req.user?.id, accion: 'ANULACION_ABONO', entidad: 'CustomerPayment', entidadId: abono.id, ip: req.ip,
    detalle: { consecutivo: abono.consecutivo, monto: abono.monto, motivo: abono.motivoAnulacion },
  });
  res.json({ success: true, message: `Abono ${abono.consecutivo} anulado; el saldo se restituyó`, data: abono });
};
