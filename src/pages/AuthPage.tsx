import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { SignIn } from '../components/Auth/SignIn'
import { UsernameRegistration } from '../components/Auth/UsernameRegistration'
import { saveSession } from '../lib/session'
import type { StoredUser } from '../lib/session'

type Step = 'sign-in' | 'username'

export default function AuthPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('sign-in')

  function handleSignInSuccess(_user: StoredUser, isNewUser: boolean) {
    if (isNewUser) {
      setStep('username')
    } else {
      navigate('/gallery')
    }
  }

  function handleUsernameSuccess(user: StoredUser) {
    const token = localStorage.getItem('pf_session')
    if (token) saveSession(token, user)
    navigate('/gallery')
  }

  if (step === 'username') {
    return <UsernameRegistration onSuccess={handleUsernameSuccess} />
  }

  return <SignIn onSuccess={handleSignInSuccess} />
}
