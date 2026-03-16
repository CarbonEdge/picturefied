import { redirect } from 'next/navigation'

// Root redirect: send authenticated users to gallery, others to login.
// Auth state is determined client-side via the keystore, so we always
// redirect to gallery and let the gallery page handle the redirect to login.
export default function RootPage() {
  redirect('/gallery')
}
