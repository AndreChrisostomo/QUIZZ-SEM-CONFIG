import 'dotenv/config';

import { createDefaultApp } from './app';

const port = Number(process.env.PORT || 3001);
const app = createDefaultApp();

app.listen(port, '0.0.0.0', () => {
  console.log(`Quiz API listening on port ${port}`);
});
