import mongoose from "mongoose";

const yearOpeningAdjustmentSchema = new mongoose.Schema(
  {
    // Entity Reference
    entityId: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },

    entityType: {
      type: String,
      required: true,
      enum: ["party", "item"],
    },

    // Financial Year
    financialYear: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },

    // Adjustment Values
    adjustmentAmount: {
      type: Number,
      default: 0,
    },

    adjustmentQuantity: {
      type: Number,
      default: 0,
    },

    // Audit Information
    reason: {
      type: String,
      required: true,
      trim: true,
    },

    createdBy: {
      type: String,
      required: true,
    },

    updatedBy: {
      type: String,
    },

    // Cancellation
    isCancelled: {
      type: Boolean,
      default: false,
    },

    cancelledAt: {
      type: Date,
    },

    cancelledBy: {
      type: String,
    },

    cancellationReason: {
      type: String,
    },
  },
  {
    timestamps: true,
    collection: "yearopeningadjustments",
  },
);

// Compound Indexes
yearOpeningAdjustmentSchema.index(
  { entityId: 1, entityType: 1, financialYear: 1 },
  {
    unique: true,
    partialFilterExpression: { isCancelled: false },
    name: "unique_active_entity_year",
  },
);

yearOpeningAdjustmentSchema.index({ financialYear: 1 });
yearOpeningAdjustmentSchema.index({ entityType: 1, financialYear: 1 });
yearOpeningAdjustmentSchema.index({ isCancelled: 1 });

// Instance Methods
yearOpeningAdjustmentSchema.methods.cancel = function (userId, reason) {
  this.isCancelled = true;
  this.cancelledAt = new Date();
  this.cancelledBy = userId;
  this.cancellationReason = reason;
  return this.save();
};

// Static Methods
yearOpeningAdjustmentSchema.statics.findByEntity = function (
  entityId,
  entityType,
) {
  return this.find({
    entityId,
    entityType,
    isCancelled: false,
  }).sort({ financialYear: 1 });
};

yearOpeningAdjustmentSchema.statics.findByYear = function (
  financialYear,
  entityType = null,
) {
  const query = { financialYear, isCancelled: false };
  if (entityType) {
    query.entityType = entityType;
  }
  return this.find(query);
};

yearOpeningAdjustmentSchema.statics.getAdjustment = function (
  entityId,
  entityType,
  financialYear,
) {
  return this.findOne({
    entityId,
    entityType,
    financialYear,
    isCancelled: false,
  });
};

// Pre-save Validation
yearOpeningAdjustmentSchema.pre("save", function (next) {
  const yearRegex = /^\d{4}$/;
  if (!yearRegex.test(this.financialYear)) {
    return next(new Error("Financial year must be in YYYY format"));
  }
  next();
});

const YearOpeningAdjustment = mongoose.model(
  "YearOpeningAdjustment",
  yearOpeningAdjustmentSchema,
);

export default YearOpeningAdjustment;
