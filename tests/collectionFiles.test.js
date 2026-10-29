import test from "node:test";
import assert from "node:assert/strict";
import { collectionFiles } from "../src/services/collectionFiles.js";

test("legacy records resolve only their own output file", () => {
  const assets = [{ id: "a", fileName: "a.json" }, { id: "b", fileName: "b.json" }];
  assert.deepEqual(collectionFiles({ assetFileId: "a" }, assets).map((item) => item.id), ["a"]);
  assert.deepEqual(collectionFiles({ resultJson: { assetFileId: "b" } }, assets).map((item) => item.id), ["b"]);
});

test("multiple output formats deduplicate IDs and preserve output ordering", () => {
  const record = { assetFileId: "a", resultJson: { files: [{ assetFileId: "b", action: "retained" }], assetFileIds: ["a", "b", "c"], assetFileId: "a" } };
  const outputs = collectionFiles(record, [{ id: "a", name: "A" }, { id: "b", name: "B" }]);
  assert.deepEqual(outputs.map((item) => item.id), ["b", "a", "c"]);
  assert.equal(outputs[0].action, "retained");
});

test("moved files navigate using their current asset location", () => {
  const record = { resultJson: { files: [{ assetFileId: "a", directoryId: "old", directory: "旧目录" }] } };
  const asset = { id: "a", directoryId: "new", directory: "新目录", fileName: "a.json" };
  const [output] = collectionFiles(record, [asset]);
  assert.equal(output.directoryId, "new");
  assert.equal(output.asset, asset);
});

test("deleted output retains snapshot metadata with no live navigation target", () => {
  const [output] = collectionFiles({ resultJson: { files: [{ assetFileId: "gone", fileName: "snapshot.json", directory: "历史", sizeBytes: 42 }] } }, []);
  assert.equal(output.fileName, "snapshot.json");
  assert.equal(output.directory, "历史");
  assert.equal(output.sizeBytes, 42);
  assert.equal(output.asset, undefined);
});

test("empty executions do not borrow another execution's files", () => {
  assert.deepEqual(collectionFiles({}, [{ id: "a", taskId: "same-task" }]), []);
  assert.deepEqual(collectionFiles({ resultJson: { files: null, assetFileIds: null } }, []), []);
});
