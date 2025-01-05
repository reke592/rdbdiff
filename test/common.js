const fs = require("fs");

const delay = (ms) => new Promise((resolve) => setTimeout(() => resolve(), ms));

const awaiter = async (path, interval = 0.2, timeout = 10, iter = 0) => {
  if (iter === timeout) throw new Error("timedout");
  if (!fs.existsSync(path)) {
    await delay(interval * 1000);
    return await awaiter(path, timeout, iter + interval);
  } else {
    return JSON.parse(fs.readFileSync(path).toString());
  }
};

module.exports = {
  delay,
  awaiter,
};
