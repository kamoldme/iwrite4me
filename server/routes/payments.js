// Public payments config — lets the frontend show only the payment options that are
// actually configured (so users never see a UZS button that 503s). UZS options stay
// hidden until you set the provider keys + prices in Railway.

const express = require('express');
const { UZS_PRICES } = require('../utils/premium');

const router = express.Router();

router.get('/config', (req, res) => {
  const providers = {
    stripe: !!process.env.STRIPE_SECRET_KEY,
    click: !!(process.env.CLICK_SERVICE_ID && process.env.CLICK_MERCHANT_ID && process.env.CLICK_SECRET_KEY),
    payme: !!(process.env.PAYME_MERCHANT_ID && process.env.PAYME_KEY),
    atmos: !!(process.env.ATMOS_CONSUMER_KEY && process.env.ATMOS_CONSUMER_SECRET && process.env.ATMOS_STORE_ID)
  };
  // A UZS price is only meaningful for the local providers.
  const uzs = { '1m': UZS_PRICES['1m'], '3m': UZS_PRICES['3m'], '6m': UZS_PRICES['6m'] };
  const localEnabled = (providers.click || providers.payme || providers.atmos)
    && (uzs['1m'] > 0 || uzs['3m'] > 0 || uzs['6m'] > 0);
  res.json({ providers, uzs, localEnabled });
});

module.exports = router;
