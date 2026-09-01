const DOMINIO_LOGIN = 'colegioatitude.local'

export function apenasDigitos(valor: string): string {
  return valor.replace(/\D/g, '')
}

export function formatarCpf(cpf: string): string {
  const d = apenasDigitos(cpf)
  if (d.length !== 11) return cpf
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
}

// O Supabase Auth exige um e-mail como identificador. Como o login aqui é
// por CPF (não existe e-mail real cadastrado para a maioria das pessoas),
// convertemos o CPF num e-mail sintético só para autenticação — nunca
// exibido, nunca usado para enviar nada.
export function cpfParaEmailLogin(cpf: string): string {
  return `${apenasDigitos(cpf)}@${DOMINIO_LOGIN}`
}
