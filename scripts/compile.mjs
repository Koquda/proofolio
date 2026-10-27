import fs from "node:fs";
import solc from "solc";
export function compileRegistry() {
  const source = fs.readFileSync(
    new URL("../contracts/CredentialRegistry.sol", import.meta.url),
    "utf8",
  );
  const output = JSON.parse(
    solc.compile(
      JSON.stringify({
        language: "Solidity",
        sources: { "CredentialRegistry.sol": { content: source } },
        settings: {
          optimizer: { enabled: true, runs: 200 },
          evmVersion: "paris",
          outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
        },
      }),
    ),
  );
  const errors = output.errors?.filter((e) => e.severity === "error");
  if (errors?.length)
    throw new Error(errors.map((e) => e.formattedMessage).join("\n"));
  return output.contracts["CredentialRegistry.sol"].CredentialRegistry;
}
