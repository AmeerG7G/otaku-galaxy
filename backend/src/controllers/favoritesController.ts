import type { RequestHandler } from 'express';
import { favoritesService } from '../services/favoritesService.js';
import { ok } from '../utils/response.js';
import { parse } from '../utils/zod.js';
import { addFavoriteSchema, favoriteParamSchema } from '../validators/cart.js';
import { paginationSchema } from '../validators/catalog.js';

type PaginationQuery = { page?: unknown; limit?: unknown };

export const favoritesController = {
  list: (async (req, res) => {
    const { page, limit } = parse(paginationSchema, {
      page: (req.query as PaginationQuery).page,
      limit: (req.query as PaginationQuery).limit,
    });
    const data = await favoritesService.list(req.auth!.id, page, limit);
    return ok(res, data);
  }) as RequestHandler,

  add: (async (req, res) => {
    const { productId } = parse(addFavoriteSchema, req.body);
    const data = await favoritesService.add(req.auth!.id, productId);
    return ok(res, data, 'أُضيف إلى المفضلة');
  }) as RequestHandler,

  remove: (async (req, res) => {
    const { productId } = parse(favoriteParamSchema, req.params);
    const data = await favoritesService.remove(req.auth!.id, productId);
    return ok(res, data, 'أُزيل من المفضلة');
  }) as RequestHandler,
};