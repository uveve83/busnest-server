import jwt from 'jsonwebtoken'

export function protect(req, res, next) {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Not authorized — no token' })
  }
  try {
    const token = authHeader.split(' ')[1]
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'dev_secret')
    next()
  } catch {
    res.status(401).json({ error: 'Not authorized — invalid token' })
  }
}

// Usage: authorize('super_admin', 'school_admin')
export function authorize(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
      return res.status(403).json({ error: `Access denied — requires role: ${roles.join(' | ')}` })
    }
    next()
  }
}
