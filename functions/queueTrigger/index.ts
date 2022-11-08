import { AzureFunction, Context } from "@azure/functions";
import { spawn } from "child_process";
import fs = require("fs");
import os = require("os");
import path = require("path");
import juice = require("juice");

function exec(
  name: string,
  args: string[]
): Promise<{ exit_code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(name, args);
    let stdout = Buffer.alloc(0);
    let stderr = Buffer.alloc(0);

    child.stdout.on("data", (data) => {
      stdout = Buffer.concat([stdout, data]);
    });

    child.stderr.on("data", (data) => {
      stderr = Buffer.concat([stderr, data]);
    });

    child.on("error", (error) => {
      reject({
        error: error,
        stdout: stdout.toString(),
        stderr: stderr.toString(),
      });
    });

    child.on("close", (code) => {
      resolve({
        exit_code: code,
        stdout: stdout.toString(),
        stderr: stderr.toString(),
      });
    });
  });
}

function inlineCSS(html: string, css: string): string {
  return juice.inlineContent(html, css);
}

const setUpTmpDir = (): string => {
  const appPrefix = "mailwind";

  return fs.mkdtempSync(path.join(os.tmpdir(), appPrefix));

  // try {
  //   if (tmpDir) {
  //     fs.rmSync(tmpDir, { recursive: true });
  //   }
  // } catch (e) {
  //   console.error(
  //     `An error has occurred while removing the temp folder at ${tmpDir}. Please remove it manually. Error: ${e}`
  //   );
  // }
};

const queueTrigger: AzureFunction = async function (
  context: Context,
  data: { batchId: number; inputHTML: string }
): Promise<void> {
  const { batchId, inputHTML } = data;
  if (!batchId || !inputHTML) {
    throw new Error("Invalid input");
  }
  const tmpDir = setUpTmpDir();
  const inputHtmlPath = path.join(tmpDir, "input.html");
  fs.writeFileSync(inputHtmlPath, inputHTML);
  context.log(`### Input HTML written to ${inputHtmlPath}`);

  const tailwindcss_path = path.resolve(
    __dirname,
    "../../node_modules/tailwindcss/lib/cli.js"
  );
  const tailwindConfigPath = path.resolve(
    __dirname,
    "../../queueTrigger/tailwind.config.js"
  );
  const inputCssPath = path.resolve(__dirname, "../../queueTrigger/style.css");
  const outputCssPath = path.resolve(os.tmpdir(), "mailwind.css");
  //   const outputHtmlPath = path.join(tmpDir, "output.html");

  context.log("### Running tailwindcss");
  const result = await exec("node", [
    tailwindcss_path,
    "--config",
    tailwindConfigPath,
    "--input",
    inputCssPath,
    "--output",
    outputCssPath,
    "--content",
    inputHtmlPath,
  ]);

  if (result.exit_code !== 0) {
    context.log("###Failed to run Tailwind.");
    context.log(result.stderr);
    return;
  }

  //   if (outputHtmlPath) {
  const outputCss = fs.readFileSync(outputCssPath).toString();

  const inlinedHTML = inlineCSS(inputHTML, outputCss);

  context.log("### InputHTML", inputHTML);

  // fs.writeFileSync(outputHtmlPath, inlinedHTML);

  context.bindings.renderedBlob = inputHTML;
  context.bindings.emailBlob = inlinedHTML;
  //   }
};

export default queueTrigger;
