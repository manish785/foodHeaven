const Joi = require("joi");

const createOrderSchema = Joi.object({
  items: Joi.array()
    .items(
      Joi.object({
        menuItemId: Joi.number().integer().positive().required(),
        quantity: Joi.number().integer().min(1).default(1),
      })
    )
    .min(1)
    .required(),
  paymentMethod: Joi.string().valid("card", "cod", "paytm").default("card"),
  deliveryAddress: Joi.object({
    name: Joi.string().trim().min(2).required(),
    email: Joi.string().email().required(),
    number: Joi.string().trim().min(8).max(20).required(),
    address: Joi.string().trim().min(5).max(255).required(),
    pincode: Joi.string().trim().min(4).max(12).required(),
  }).required(),
});

const confirmPaymentSchema = Joi.object({
  status: Joi.string().valid("SUCCESS", "FAILED").default("SUCCESS"),
  paymentRef: Joi.string().trim().max(60).optional(),
  provider: Joi.string().trim().max(80).optional(),
});

const updateOrderStatusSchema = Joi.object({
  status: Joi.string()
    .valid("ACCEPTED", "PREPARING", "READY", "PICKED_UP", "OUT_FOR_DELIVERY", "DELIVERED")
    .required(),
});

module.exports = {
  createOrderSchema,
  confirmPaymentSchema,
  updateOrderStatusSchema,
};
