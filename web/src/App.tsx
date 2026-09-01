import './App.css'
import { AuthProvider, useAuth } from './auth/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import ColaboradorPage from './pages/ColaboradorPage'
import CoordenadorPage from './pages/CoordenadorPage'
import RHPage from './pages/RHPage'

function Conteudo() {
  const { session, perfil, loading } = useAuth()

  if (loading) return <div className="tela-cheia">Carregando…</div>

  if (!session) return <Login />

  if (!perfil) {
    return (
      <div className="tela-cheia">
        <p>
          Seu usuário está autenticado, mas não tem um perfil cadastrado (colaborador, coordenador
          ou RH). Peça para o RH vincular seu login a um cadastro.
        </p>
      </div>
    )
  }

  return (
    <Layout>
      {perfil.perfil === 'colaborador' && <ColaboradorPage />}
      {perfil.perfil === 'coordenador' && <CoordenadorPage />}
      {perfil.perfil === 'rh' && <RHPage />}
    </Layout>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <Conteudo />
    </AuthProvider>
  )
}
