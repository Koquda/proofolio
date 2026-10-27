import ganache from "@ganache/core";
const server = ganache.server({
  chain: { chainId: 31337, hardfork: "shanghai" },
  wallet: {
    mnemonic: "test test test test test test test test test test test junk",
  },
  logging: { quiet: true },
});
await server.listen(8545, "127.0.0.1");
console.log("Local test chain ready at http://127.0.0.1:8545, chain ID 31337.");
console.log(
  "Uses a public development mnemonic. Never send real funds or expose this endpoint.",
);
console.log(
  "Run npm run deploy:local in another terminal. Restarting resets chain data.",
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    await server.close();
    process.exit();
  });
