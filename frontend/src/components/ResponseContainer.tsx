// ResponseContainer.tsx – slimmer external API
import React, { useState, useRef, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import TextareaAutosize from "react-textarea-autosize";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, CheckCircle, Rocket, Copy, PartyPopper } from "lucide-react";

interface Payload {
  policy: string;
  chatResponse: string;
  previousPrompt: string;
  showPolicyAnimation: boolean;
}

interface ResponseProps {
  data: Payload;                // <— single blob prop
  token: string;
  selectedProject: string;
}

const ResponseContainer: React.FC<ResponseProps> = ({ data, token, selectedProject }) => {
  const { policy, chatResponse, previousPrompt, showPolicyAnimation } = data;

  /* ---- LOCAL state purely for UX toggles ---- */
  const [policyEditable, setPolicyEditable] = useState(policy);
  const [policyCopied, setPolicyCopied] = useState(false);
  const [policyApplied, setPolicyApplied] = useState(false);
  const [applyLoading, setApplyLoading]   = useState(false);

  useEffect(() => {
    // make sure the policy updates when the prop changes
    setPolicyEditable(policy);

    setPolicyApplied(false);
    setPolicyCopied(false);
  }, [policy]);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(policyEditable);
    setPolicyCopied(true);
    setTimeout(() => setPolicyCopied(false), 3_000);
  };

  const isJsonString = (s: string) => {
    console.log("isJsonString", s);
    try { JSON.parse(s); return true; } catch { return false; }
  };

  const applyPolicy = async () => {
    if (!token || !selectedProject) return;
    try {
      setApplyLoading(true);
      await fetch("http://localhost:8000/apply_policy", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "project-id": selectedProject,
        },
        body: JSON.stringify({ policy: policyEditable }),
      });
      setPolicyApplied(true);
    } finally {
      setApplyLoading(false);
    }
  };

  /* ------------------------------ UI ------------------------------ */
  return (
    <div className="response-container h-auto">
      {previousPrompt && (
        <div className="mb-2 text-left">
          <strong>Prompt:</strong> {previousPrompt}
        </div>
      )}

      {/* –––––––––––––––––– Policy Card –––––––––––––––––– */}
      {policy && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: showPolicyAnimation ? 0.1 : 0 }}
        >
          <Card className="mb-4 policy-output">
            <CardHeader className="output-header pb-2">
              <CardTitle className="font-semibold text-[#0F9D58]">Generated Policy</CardTitle>

              {/* button stack */}
              <motion.div layout className="flex space-x-2">
                {!!token && !!selectedProject && (
                  <Button
                    variant="secondary"
                    onClick={applyPolicy}
                    disabled={applyLoading || policyApplied}
                    className={
                      policyApplied
                        ? "text-[#0F9D58] dark:text-[#0F9D58]"
                        : "custom-red-hover disabled:bg-[#DB4437]/25"
                    }
                  >
                    <AnimatePresence mode="popLayout">
                      {applyLoading ? (
                        <motion.span
                          key="verifying"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="flex items-center"
                        >
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Verifying
                        </motion.span>
                      ) : policyApplied ? (
                        <motion.span
                          key="applied"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="flex items-center"
                        >
                          <CheckCircle className="h-4 w-4 mr-2" />
                          Policy Applied
                        </motion.span>
                      ) : (
                        <motion.span
                          key="apply"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="flex items-center"
                        >
                          <Rocket className="h-4 w-4 mr-2" />
                          Apply Policy
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </Button>
                )}

                <Button
                  variant="secondary"
                  onClick={copyToClipboard}
                  disabled={policyCopied}
                  className="custom-orange-hover"
                >
                  <AnimatePresence mode="popLayout">
                    {policyCopied ? (
                      <motion.span
                        key="copied"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="flex items-center"
                      >
                        <PartyPopper className="h-4 w-4 mr-2" />
                        Copied!
                      </motion.span>
                    ) : (
                      <motion.span
                        key="copy"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="flex items-center"
                      >
                        <Copy className="h-4 w-4 mr-2" />
                        Copy Policy
                      </motion.span>
                    )}
                  </AnimatePresence>
                </Button>
              </motion.div>
            </CardHeader>

            <CardContent>
              <div className="rounded-md border">
                {isJsonString(policyEditable) ? (
                  <TextareaAutosize
                    ref={textareaRef}
                    className="policy-textbox w-full font-mono"
                    value={policyEditable}
                    onChange={(e) => {
                      setPolicyEditable(e.target.value);
                      policyApplied && setPolicyApplied(false);
                      policyCopied && setPolicyCopied(false);
                    }}
                    minRows={4}
                    maxRows={20}
                    spellCheck={false}
                    style={{ borderColor: "#4285F4", resize: "none", padding: "0.5rem" }}
                  />
                ) : (
                  <pre className="policy-pre">{policyEditable}</pre>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* ––––––––––––––– Chat Response ––––––––––––––– */}
      {chatResponse && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: showPolicyAnimation ? 0.3 : 0 }}
        >
          <Card className="chat-output">
            <CardHeader className="output-header pb-2">
              <CardTitle className="font-semibold text-[#4285F4]">Chat Response</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-60">
                <pre className="chat-pre" style={{ borderColor: "#4285F4" }}>
                  {chatResponse}
                </pre>
              </ScrollArea>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  );
};

export default ResponseContainer;