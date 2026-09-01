export type Perfil = 'colaborador' | 'coordenador' | 'rh'

export interface MeuPerfil {
  perfil: Perfil
  id: string
  nome: string
  coordenador_id: string | null
}

export type StatusLancamento = 'pendente' | 'aprovado' | 'recusado'
export type Destino = 'banco_horas' | 'folha'
export type Origem = 'colaborador' | 'rh_manual'

export const MOTIVOS: { value: string; label: string }[] = [
  { value: 'reuniao_pedagogica', label: 'Reunião pedagógica' },
  { value: 'evento_escolar', label: 'Evento escolar' },
  { value: 'cobertura_ausencia', label: 'Cobertura de ausência' },
  { value: 'demanda_urgente', label: 'Demanda urgente' },
  { value: 'fechamento_periodo_letivo', label: 'Fechamento de período letivo' },
  { value: 'outro', label: 'Outro' },
]

export interface Lancamento {
  id: string
  colaborador_id: string
  data_hora_extra: string
  hora_entrada: string
  hora_saida: string
  duracao_calculada: string
  motivo: string
  motivo_outro_texto: string | null
  status: StatusLancamento
  destino: Destino
  origem: Origem
  justificativa_manual: string | null
  enviado_em: string
  aprovado_por: string | null
  decidido_em: string | null
  colaboradores?: {
    nome_completo: string
    matricula: string
    setor: string | null
  }
}

export interface Colaborador {
  id: string
  user_id: string | null
  nome_completo: string
  matricula: string
  cargo: string | null
  setor: string | null
  coordenador_id: string | null
  ativo: boolean
}

export interface Coordenador {
  id: string
  user_id: string | null
  nome: string
  setor: string | null
  ativo: boolean
}

export interface IndicadorExcesso {
  colaborador_id: string
  nome_completo: string
  matricula: string
  data_hora_extra: string
  mes_referencia: string
  horas_no_dia: number
  horas_no_mes: number
  excesso_diario: boolean
  excesso_mensal: boolean
}
