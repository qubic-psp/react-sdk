// The same checks as consumer.mjs, loading React and the package with require().
'use strict';

import('./consumer.mjs')
  .then(({ run }) => run(async (name) => require(name), 'cjs'))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
