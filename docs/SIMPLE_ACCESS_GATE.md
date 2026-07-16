# Simple Access Gate

## Function
- first page view shows a login gate before the dashboard
- access word: `inno`
- button label: `Enter Terminal`
- generic error: `Access denied.`

## Attempts And Lockout
- maximum 3 failed attempts
- lockout is stored in the same browser
- current lockout duration: 24 hours
- reload keeps the unlocked state
- logout clears the unlocked state

## Security Note
- this is only a light internal preview barrier
- it is not a replacement for professional authentication
- if the repo becomes public, a fallback password in shipped client code is visible
- therefore `SIMPLE_GATE_PASSWORD` in env is preferred even for preview mode
