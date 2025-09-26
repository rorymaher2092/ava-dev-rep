// Convert JSON topology to BPMN XML without DI
export function jsonToBpmnNoDI(model: {
    title?: string;
    processId?: string;
    name?: string;
    lanes?: { id: string; name?: string }[];
    nodes: { id: string; type: string; name?: string; laneId?: string }[];
    flows: { id: string; source: string; target: string; name?: string }[];
}): string {
    console.log("=== BPMN CONVERTER START ===");
    console.log("Input model:", JSON.stringify(model, null, 2));

    // Validate required fields
    if (!model) {
        throw new Error("Model is required");
    }
    if (!Array.isArray(model.nodes)) {
        throw new Error("Model.nodes must be an array");
    }
    if (!Array.isArray(model.flows)) {
        throw new Error("Model.flows must be an array");
    }
    if (model.nodes.length === 0) {
        throw new Error("Model must have at least one node");
    }

    // Set default processId if not provided
    const processId = model.processId || "Process_1";
    console.log("Using processId:", processId);

    const esc = (s = "") => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

    console.log("Processing lanes...");
    const laneSets = model.lanes?.length
        ? `<bpmn:laneSet id="LaneSet_1">` +
          model.lanes
              .map(l => {
                  console.log("Processing lane:", l);
                  const nodesInLane = model.nodes.filter(n => n.laneId === l.id);
                  console.log(
                      "Nodes in lane",
                      l.id,
                      ":",
                      nodesInLane.map(n => n.id)
                  );
                  return (
                      `<bpmn:lane id="${esc(l.id)}" name="${esc(l.name || "")}">` +
                      nodesInLane.map(n => `<bpmn:flowNodeRef>${esc(n.id)}</bpmn:flowNodeRef>`).join("") +
                      `</bpmn:lane>`
                  );
              })
              .join("") +
          `</bpmn:laneSet>`
        : "";
    console.log("Generated lane sets:", laneSets);

    const nodeTag = (t: string) => {
        const map: Record<string, string> = {
            startEvent: "bpmn:startEvent",
            endEvent: "bpmn:endEvent",
            task: "bpmn:task",
            userTask: "bpmn:userTask",
            serviceTask: "bpmn:serviceTask",
            manualTask: "bpmn:manualTask",
            scriptTask: "bpmn:scriptTask",
            businessRuleTask: "bpmn:businessRuleTask",
            intermediateCatchEvent: "bpmn:intermediateCatchEvent",
            intermediateThrowEvent: "bpmn:intermediateThrowEvent",
            exclusiveGateway: "bpmn:exclusiveGateway",
            parallelGateway: "bpmn:parallelGateway",
            inclusiveGateway: "bpmn:inclusiveGateway"
        };
        const result = map[t] || "bpmn:task";
        if (!map[t]) {
            console.warn("Unknown node type:", t, "defaulting to task");
        }
        return result;
    };

    console.log("Processing flows...");
    const incoming = new Map<string, string[]>();
    const outgoing = new Map<string, string[]>();
    for (const f of model.flows) {
        console.log("Processing flow:", f);
        if (!f.source || !f.target) {
            console.warn("Flow missing source or target:", f);
            continue;
        }
        (outgoing.get(f.source) ?? outgoing.set(f.source, []).get(f.source)!).push(f.id);
        (incoming.get(f.target) ?? incoming.set(f.target, []).get(f.target)!).push(f.id);
    }
    console.log("Incoming flows map:", Object.fromEntries(incoming));
    console.log("Outgoing flows map:", Object.fromEntries(outgoing));

    console.log("Processing nodes...");
    const nodesXml = model.nodes
        .map(n => {
            console.log("Processing node:", n);
            if (!n.id) {
                console.error("Node missing id:", n);
                throw new Error("All nodes must have an id");
            }
            if (!n.type) {
                console.error("Node missing type:", n);
                throw new Error("All nodes must have a type");
            }

            const tag = nodeTag(n.type);
            const inc = (incoming.get(n.id) || []).map(id => `<bpmn:incoming>${esc(id)}</bpmn:incoming>`).join("");
            const out = (outgoing.get(n.id) || []).map(id => `<bpmn:outgoing>${esc(id)}</bpmn:outgoing>`).join("");
            const nameAttr = n.name ? ` name="${esc(n.name)}"` : "";
            const result = `<${tag} id="${esc(n.id)}"${nameAttr}>${inc}${out}</${tag}>`;
            console.log("Generated node XML:", result);
            return result;
        })
        .join("");
    console.log("All nodes XML:", nodesXml);

    console.log("Processing flows XML...");
    const flowsXml = model.flows
        .map(f => {
            if (!f.id || !f.source || !f.target) {
                console.error("Flow missing required fields:", f);
                throw new Error("All flows must have id, source, and target");
            }
            const result = `<bpmn:sequenceFlow id="${esc(f.id)}" sourceRef="${esc(f.source)}" targetRef="${esc(f.target)}"${f.name ? ` name="${esc(f.name)}"` : ""} />`;
            console.log("Generated flow XML:", result);
            return result;
        })
        .join("");
    console.log("All flows XML:", flowsXml);

    const finalXml = `<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                   xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                   xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
                   xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
                   xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
                   id="Defs_${esc(processId)}"
                   targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="${esc(processId)}" isExecutable="false" name="${esc(model.name || processId)}">
    ${laneSets}
    ${nodesXml}
    ${flowsXml}
  </bpmn:process>
</bpmn:definitions>`;

    console.log("=== BPMN CONVERTER COMPLETE ===");
    console.log("Final XML length:", finalXml.length);
    console.log("Final XML (first 1000 chars):", finalXml.substring(0, 1000));

    return finalXml;
}
