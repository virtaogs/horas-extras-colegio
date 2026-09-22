const TZ = 'America/Sao_Paulo'

function hojeISO(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function horaAgora(): { h: number; m: number } {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date())
  const h = Number(partes.find((p) => p.type === 'hour')?.value ?? '0')
  const m = Number(partes.find((p) => p.type === 'minute')?.value ?? '0')
  return { h, m }
}

function parseISO(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function addDias(d: Date, n: number): Date {
  const r = new Date(d)
  r.setUTCDate(r.getUTCDate() + n)
  return r
}

function inicioDoMes(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
}

// Dia útil = não é domingo e não é feriado cadastrado. Sábado conta
// como dia útil de propósito (o colégio funciona aos sábados) — mesma
// regra do banco (public.eh_dia_util).
function ehDiaUtil(d: Date, feriadosISO: Set<string>): boolean {
  return d.getUTCDay() !== 0 && !feriadosISO.has(toISO(d))
}

function primeiroDiaUtil(inicio: Date, feriadosISO: Set<string>): Date {
  let d = inicio
  while (!ehDiaUtil(d, feriadosISO)) {
    d = addDias(d, 1)
  }
  return d
}

function somarDiasUteis(data: Date, quantidade: number, feriadosISO: Set<string>): Date {
  let d = data
  let restante = quantidade
  while (restante > 0) {
    d = addDias(d, 1)
    if (ehDiaUtil(d, feriadosISO)) restante -= 1
  }
  return d
}

function subtrairDiasUteis(data: Date, quantidade: number, feriadosISO: Set<string>): Date {
  let d = data
  let restante = quantidade
  while (restante > 0) {
    d = addDias(d, -1)
    if (ehDiaUtil(d, feriadosISO)) restante -= 1
  }
  return d
}

export interface PrazoLancamento {
  min: string
  max: string
  exceptionAtiva: boolean
  ultimoDiaMesAnterior: string
  textoPrazo: string
}

export function calcularPrazo(feriadosISO: string[]): PrazoLancamento {
  const feriadosSet = new Set(feriadosISO)
  const hoje = parseISO(hojeISO())
  const inicioMes = inicioDoMes(hoje)
  const ultimoDiaMesAnterior = addDias(inicioMes, -1)
  const diaUtil = primeiroDiaUtil(inicioMes, feriadosSet)
  const { h, m } = horaAgora()

  let exceptionAtiva = false
  if (hoje.getTime() < diaUtil.getTime()) {
    exceptionAtiva = true
  } else if (hoje.getTime() === diaUtil.getTime()) {
    exceptionAtiva = h < 8 || (h === 8 && m === 0)
  }

  const hojeMenos2Uteis = subtrairDiasUteis(hoje, 2, feriadosSet)
  const inicioJanela = hojeMenos2Uteis.getTime() > inicioMes.getTime() ? hojeMenos2Uteis : inicioMes
  const min = exceptionAtiva ? toISO(ultimoDiaMesAnterior) : toISO(inicioJanela)

  const textoPrazo = exceptionAtiva
    ? `Você ainda pode lançar hora extra do dia ${formatarDiaMes(ultimoDiaMesAnterior)} (último dia do mês passado) até as 08h de ${formatarDiaMes(diaUtil)}. Depois disso, só dentro do mês corrente, em até 2 dias úteis após a data (sábado conta como dia útil).`
    : `Lance a hora extra em até 2 dias úteis após a data (sábado conta como dia útil, só domingo e feriado não contam), sempre dentro do mês corrente. Fora desse prazo, procure o RH.`

  return { min, max: toISO(hoje), exceptionAtiva, ultimoDiaMesAnterior: toISO(ultimoDiaMesAnterior), textoPrazo }
}

function formatarDiaMes(d: Date): string {
  const dia = String(d.getUTCDate()).padStart(2, '0')
  const mes = String(d.getUTCMonth() + 1).padStart(2, '0')
  return `${dia}/${mes}`
}

// Mesma regra do banco (public.pode_lancar_hora_extra), usada aqui só
// para dar um aviso amigável antes de enviar — quem decide de verdade é
// o trigger no servidor.
export function podeLancarData(dataISO: string, feriadosISO: string[]): boolean {
  const feriadosSet = new Set(feriadosISO)
  const hoje = parseISO(hojeISO())
  const data = parseISO(dataISO)
  if (data.getTime() > hoje.getTime()) return false

  const inicioMes = inicioDoMes(hoje)
  if (data.getTime() >= inicioMes.getTime()) {
    return hoje.getTime() <= somarDiasUteis(data, 2, feriadosSet).getTime()
  }

  const ultimoDiaMesAnterior = addDias(inicioMes, -1)
  if (data.getTime() === ultimoDiaMesAnterior.getTime()) {
    const diaUtil = primeiroDiaUtil(inicioMes, feriadosSet)
    const { h, m } = horaAgora()
    if (hoje.getTime() < diaUtil.getTime()) return true
    if (hoje.getTime() === diaUtil.getTime()) return h < 8 || (h === 8 && m === 0)
    return false
  }

  return false
}

export function formatarDuracao(intervalo: string): string {
  // vem do Postgres como "HH:MM:SS" (ou "1 day HH:MM:SS" em casos raros)
  const match = intervalo.match(/(\d+):(\d+):\d+$/)
  if (!match) return intervalo
  const horas = Number(match[1])
  const minutos = Number(match[2])
  if (minutos === 0) return `${horas}h`
  return `${horas}h ${minutos}min`
}

export function intervaloParaHoras(intervalo: string): number {
  const match = intervalo.match(/(\d+):(\d+):(\d+)$/)
  if (!match) return 0
  const [, h, m] = match
  return Number(h) + Number(m) / 60
}
