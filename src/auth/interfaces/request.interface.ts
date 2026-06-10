// src/auth/interfaces/request.interface.ts
import { Request } from 'express';

export interface RequestWithUser extends Request {
  user: {
    userId: string;
    email: string;
    role: string;
  };
}