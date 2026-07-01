import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: process.env.PORT || 4000,
  jwtSecret: process.env.JWT_SECRET || 'dev-secret',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
};
