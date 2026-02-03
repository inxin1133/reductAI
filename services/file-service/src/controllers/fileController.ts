import { Request, Response } from 'express';

const notImplemented = (res: Response, feature: string) => {
  res.status(501).json({ message: 'Not implemented', feature });
};

export const listFiles = async (_req: Request, res: Response) => {
  notImplemented(res, 'listFiles');
};

export const getFile = async (_req: Request, res: Response) => {
  notImplemented(res, 'getFile');
};

export const createFile = async (_req: Request, res: Response) => {
  notImplemented(res, 'createFile');
};

export const deleteFile = async (_req: Request, res: Response) => {
  notImplemented(res, 'deleteFile');
};
