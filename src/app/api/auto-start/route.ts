import { exec } from 'child_process'
import { NextResponse } from 'next/server'

export async function POST() {
  exec(
    'cd /d "C:\\Users\\joris\\Documents\\Capitalife Engine\\bridge" && start /B python app.py',
    { shell: 'cmd.exe' }
  )
  return NextResponse.json({ started: true })
}
