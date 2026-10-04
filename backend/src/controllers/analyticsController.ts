import type { Request, RequestHandler } from 'express';
import { analyticsReports } from '../services/analytics/reports.js';
import { ok } from '../utils/response.js';
import { parse } from '../utils/zod.js';
import {
  analyticsCompareSchema,
  analyticsOverviewSchema,
  analyticsProductsSchema,
  analyticsRangeSchema,
  analyticsSalesSchema,
} from '../validators/analytics.js';

/**
 * «التحليلات» — قراءةٌ فقط، وكل المسارات `can('analytics')` (`routes/admin.ts`).
 *
 * [SECURITY] الربح والتكلفة يكشفان هامش المتجر وتكلفة المنتجات: لا يُبنيان إلا
 * لمسؤولٍ أعلى، ويغيبان كلياً عن ردّ غيره (D1).
 */
const includeProfit = (req: Request) => req.auth?.isSuperAdmin === true;

export const analyticsController = {
  periods: (async (_req, res) => ok(res, await analyticsReports.periods())) as RequestHandler,

  overview: (async (req, res) => {
    const input = parse(analyticsOverviewSchema, req.query);
    return ok(res, await analyticsReports.overview({ ...input, includeProfit: includeProfit(req) }));
  }) as RequestHandler,

  compare: (async (req, res) => {
    const input = parse(analyticsCompareSchema, req.query);
    return ok(res, await analyticsReports.compare({ ...input, includeProfit: includeProfit(req) }));
  }) as RequestHandler,

  sales: (async (req, res) => {
    const input = parse(analyticsSalesSchema, req.query);
    return ok(res, await analyticsReports.sales({ ...input, includeProfit: includeProfit(req) }));
  }) as RequestHandler,

  customers: (async (req, res) => {
    return ok(res, await analyticsReports.customers(parse(analyticsRangeSchema, req.query)));
  }) as RequestHandler,

  products: (async (req, res) => {
    const input = parse(analyticsProductsSchema, req.query);
    return ok(res, await analyticsReports.products({ ...input, includeProfit: includeProfit(req) }));
  }) as RequestHandler,

  inventory: (async (req, res) => {
    const input = parse(analyticsRangeSchema, req.query);
    return ok(res, await analyticsReports.inventory({ ...input, includeProfit: includeProfit(req) }));
  }) as RequestHandler,

  categories: (async (req, res) => {
    return ok(res, await analyticsReports.categories(parse(analyticsRangeSchema, req.query)));
  }) as RequestHandler,

  governorates: (async (req, res) => {
    return ok(res, await analyticsReports.governorates(parse(analyticsRangeSchema, req.query)));
  }) as RequestHandler,

  marketing: (async (req, res) => {
    return ok(res, await analyticsReports.marketing(parse(analyticsRangeSchema, req.query)));
  }) as RequestHandler,

  behaviour: (async (req, res) => {
    return ok(res, await analyticsReports.behaviour(parse(analyticsRangeSchema, req.query)));
  }) as RequestHandler,

  notifications: (async (req, res) => {
    return ok(res, await analyticsReports.notifications(parse(analyticsRangeSchema, req.query)));
  }) as RequestHandler,
};
