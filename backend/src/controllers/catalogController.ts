import type { RequestHandler } from 'express';
import { catalogService } from '../services/catalogService.js';
import { resolveLocale } from '../utils/locale.js';
import { ok } from '../utils/response.js';
import { parse } from '../utils/zod.js';
import {
  listProductsSchema,
  productIdParamSchema,
  searchSchema,
} from '../validators/catalog.js';

export const catalogController = {
  home: (async (req, res) => {
    const data = await catalogService.getHome(resolveLocale(req));
    return ok(res, data);
  }) as RequestHandler,

  categories: (async (req, res) => {
    const data = await catalogService.listCategories(resolveLocale(req));
    return ok(res, { items: data });
  }) as RequestHandler,

  products: (async (req, res) => {
    const input = parse(listProductsSchema, {
      page: req.query.page,
      limit: req.query.limit,
      categoryId: req.query.categoryId,
      subcategoryId: req.query.subcategoryId,
      offer: req.query.offer,
      selected: req.query.selected,
      sort: req.query.sort,
    });
    const data = await catalogService.listProducts({
      page: input.page,
      limit: input.limit,
      categoryId: input.categoryId,
      subcategoryId: input.subcategoryId,
      isOffer: input.offer,
      isSelected: input.selected,
      sort: input.sort,
    }, resolveLocale(req));
    return ok(res, data);
  }) as RequestHandler,

  search: (async (req, res) => {
    const input = parse(searchSchema, { q: req.query.q, page: req.query.page, limit: req.query.limit });
    const data = await catalogService.search(input.q, input.page, input.limit, resolveLocale(req));
    return ok(res, data);
  }) as RequestHandler,

  product: (async (req, res) => {
    const { id } = parse(productIdParamSchema, req.params);
    const data = await catalogService.productDetail(id, resolveLocale(req));
    return ok(res, data);
  }) as RequestHandler,

  governorates: (async (req, res) => {
    const data = await catalogService.listGovernorates(resolveLocale(req));
    return ok(res, { items: data });
  }) as RequestHandler,
};