import { Router } from 'express';
import {
  getCampaigns,
  getCampaignById,
  createCampaign,
  updateCampaign,
  deleteCampaign,
} from '../controllers/campaignController.js';
import { requireAuth } from '../middleware/authDev.js';
import { validateRequest } from '../middleware/validate.js';
import { idParamSchema, paginationQuerySchema } from '../validators/commonValidator.js';
import { createCampaignSchema, updateCampaignSchema } from '../validators/campaignValidator.js';

const router = Router();

router.use(requireAuth);

router.get('/', validateRequest({ query: paginationQuerySchema }), getCampaigns);
router.get('/:id', validateRequest({ params: idParamSchema }), getCampaignById);
router.post('/', validateRequest({ body: createCampaignSchema }), createCampaign);
router.put(
  '/:id',
  validateRequest({ params: idParamSchema, body: updateCampaignSchema }),
  updateCampaign,
);
router.delete('/:id', validateRequest({ params: idParamSchema }), deleteCampaign);

export default router;
