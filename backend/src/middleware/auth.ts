import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import type { AuthUser } from '../types/index.js';
import { Errors } from '../utils/errors.js';

declare module 'express-serve-static-core' {
  interface Request {
    auth?: AuthUser;
  }
}

/** فحص JWT وحقن بيانات المستخدم في الطلب. */
export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(Errors.unauthorized('مطلوب تسجيل الدخول'));
  }
  try {
    const payload = jwt.verify(header.slice(7), config.jwtSecret) as jwt.JwtPayload;
    if (!payload.sub || typeof payload.sub !== 'string' || !payload.role) {
      return next(Errors.unauthorized('رمز غير صالح'));
    }
    req.auth = {
      id: payload.sub,
      role: payload.role as 'customer' | 'admin',
      phone: (payload.phone as string | undefined) ?? '',
    };
    return next();
  } catch {
    return next(Errors.unauthorized('الرمز منتهي أو غير صالح'));
  }
}

/** حماية مسارات الإدارة: يتطلب دور admin. */
export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (req.auth?.role !== 'admin') {
    return next(Errors.forbidden());
  }
  return next();
}