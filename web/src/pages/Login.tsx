import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthContext'
import { apenasDigitos, cpfParaEmailLogin } from '../lib/cpf'

export default function Login() {
  const { signIn } = useAuth()
  const [cpf, setCpf] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setErro(null)

    const digitos = apenasDigitos(cpf)
    if (digitos.length !== 11) {
      setErro('Digite o CPF completo, com 11 números.')
      return
    }

    setEnviando(true)
    const msg = await signIn(cpfParaEmailLogin(digitos), senha)
    setEnviando(false)
    if (msg) setErro('CPF ou senha incorretos.')
  }

  return (
    <div className="tela-login">
      <form className="cartao" onSubmit={handleSubmit}>
        <h1>Horas Extras</h1>
        <p className="subtitulo">Colégio — controle e aprovação</p>

        <label>
          CPF
          <input
            type="text"
            inputMode="numeric"
            placeholder="000.000.000-00"
            value={cpf}
            onChange={(e) => setCpf(e.target.value)}
            required
            autoFocus
          />
        </label>

        <label>
          Senha
          <input
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            required
          />
        </label>

        {erro && <p className="erro">{erro}</p>}

        <button type="submit" disabled={enviando}>
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>

        <p className="nota-login">Esqueceu a senha? Procure o RH para redefinir.</p>
      </form>
    </div>
  )
}
