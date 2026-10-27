import { ContractFactory, JsonRpcProvider } from "ethers";
import { compileRegistry } from "./compile.mjs";
const provider = new JsonRpcProvider("http://127.0.0.1:8545");
try {
  if ((await provider.getNetwork()).chainId !== 31337n)
    throw new Error("Deployment is restricted to the local chain, ID 31337.");
  const signer = await provider.getSigner(0),
    artifact = compileRegistry();
  const registry = await new ContractFactory(
    artifact.abi,
    artifact.evm.bytecode.object,
    signer,
  ).deploy();
  await registry.waitForDeployment();
  console.log("Local CredentialRegistry deployed.");
  console.log(`Registry: ${await registry.getAddress()}`);
  console.log(
    `Administrator and first authorized issuer: ${await signer.getAddress()}`,
  );
  console.log(
    "Open Proofolio settings and save this registry with chain ID 31337 and RPC http://127.0.0.1:8545.",
  );
} finally {
  provider.destroy();
}
