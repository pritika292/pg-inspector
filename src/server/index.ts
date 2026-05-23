import { createApp } from "./app.js";

const port = Number(process.env.PORT) || 3014;
const app = createApp();

app.listen(port, () => {
  console.log(`pg-inspector listening on :${port}`);
});
