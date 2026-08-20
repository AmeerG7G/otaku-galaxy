import type { RequestHandler } from 'express';
import { cartService } from '../services/cartService.js';
import { ok } from '../utils/response.js';
import { parse } from '../utils/zod.js';
import {
  addCartItemSchema,
  cartItemParamSchema,
  updateCartItemSchema,
} from '../validators/cart.js';

export const cartController = {
  get: (async (req, res) => {
    const items = await cartService.getCart(req.auth!.id);
    return ok(res, { items });
  }) as RequestHandler,

  add: (async (req, res) => {
    const input = parse(addCartItemSchema, req.body);
    const data = await cartService.addItem(req.auth!.id, input);
    return ok(res, data, 'أُضيف إلى العربة');
  }) as RequestHandler,

  updateQuantity: (async (req, res) => {
    const input = parse(updateCartItemSchema, { ...req.body, id: req.params.id });
    const items = await cartService.updateQuantity(req.auth!.id, input.id, input.quantity);
    return ok(res, { items });
  }) as RequestHandler,

  remove: (async (req, res) => {
    const { id } = parse(cartItemParamSchema, req.params);
    const items = await cartService.removeItem(req.auth!.id, id);
    return ok(res, { items }, 'أُزيل من العربة');
  }) as RequestHandler,
};