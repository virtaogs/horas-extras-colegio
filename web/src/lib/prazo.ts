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

function ehFimDeSemana(d: Date): boolean {
  const dia = d.getUTCDay() // 0 = domingo, 6 = sábado
  return dia === 0 || dia === 6
}

function primeiroDiaUtil(inicio: Date, feriadosISO: Set<string>): Date {
  let d = inicio
  while (ehFimDeSemana(d) || feriadosISO.has(toISO(d))) {
    d = addDias(d, 1)
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

  const hojeMenos2 = addDias(hoje, -2)
  const inicioJanela = hojeMenos2.getTime() > inicioMes.getTime() ? hojeMenos2 : inicioMes
  const min = exceptionAtiva ? toISO(ultimoDiaMesAnterior) : toISO(inicioJanela)

  const textoPrazo = exceptionAtiva
    ? `Você ainda pode lançar hora extra do dia ${formatarDiaMes(ultimoDiaMesAnterior)} (último dia do mês passado) até as 08h de ${formatarDiaMes(diaUtil)}. Depois disso, só dentro do mês corrente, em até 2 dias corridos após a data.`
    : `Lance a hora extra em até 2 dias corridos após a data, sempre dentro do mês corrente. Fora desse prazo, procure o RH.`

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
    const diff = Math.round((hoje.getTime() - data.getTime()) / 86400000)
    return diff <= 2
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
