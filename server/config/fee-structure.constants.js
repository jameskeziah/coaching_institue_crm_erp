const FeeStructureCategory = Object.freeze({
  FOUNDATION: 'FOUNDATION',
  BOARD_FOUNDATION: 'BOARD_FOUNDATION',
  JEE_NEET: 'JEE_NEET',
  AI_DATA_SCIENCE: 'AI_DATA_SCIENCE',
  OTHER: 'OTHER',
});

const FEE_STRUCTURE_CATEGORIES = Object.values(FeeStructureCategory);

module.exports = {
  FeeStructureCategory,
  FEE_STRUCTURE_CATEGORIES,
};
