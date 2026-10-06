'use strict';

const ritual = require('./frontend/assets/js/ritual-core.js');
const career = require('./frontend/assets/js/career-core.js');
require('./frontend/assets/js/draft-inspection-core.js');
const draftWorkflow = require('./frontend/assets/js/draft-workflow-core.js');

module.exports = {
  ...ritual,
  ...career,
  ritual,
  career,
  draftWorkflow
};
