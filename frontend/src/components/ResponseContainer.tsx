// ResponseContainer.tsx – slimmer external API
import React, { useState, useRef, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import TextareaAutosize from "react-textarea-autosize";
import { Button } from "@/components/ui/button";
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
  const { policy, chatResponse, previousPrompt } = data;

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
      const backendUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";
      await fetch(`${backendUrl}/apply_policy`, {
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
    <div className="space-y-6">
      {previousPrompt && (
        <div className="mb-2 text-left">
          <strong>Prompt:</strong> {previousPrompt}
        </div>
      )}

      {/* –––––––––––––––––– Policy Card –––––––––––––––––– */}
      {policy && (
        <div>
          <Card className="mb-6">
            <CardHeader className="output-header pb-2">
              <CardTitle className="font-semibold text-[#0F9D58]">Generated Policy</CardTitle>

              {/* button stack */}
              <div className="flex space-x-2">
                {!!token && !!selectedProject && (
                  <Button
                    variant="secondary"
                    onClick={applyPolicy}
                    disabled={applyLoading || policyApplied}
                    className={
                      policyApplied
                        ? "bg-green-600 text-white hover:bg-green-700"
                        : "bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                    }
                  >
                    {applyLoading ? (
                      <span className="flex items-center">
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Verifying
                      </span>
                    ) : policyApplied ? (
                      <span className="flex items-center">
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Policy Applied
                      </span>
                    ) : (
                      <span className="flex items-center">
                        <Rocket className="h-4 w-4 mr-2" />
                        Apply Policy
                      </span>
                    )}
                  </Button>
                )}

                <Button
                  variant="secondary"
                  onClick={copyToClipboard}
                  disabled={policyCopied}
                  className="bg-gray-600 text-white hover:bg-gray-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {policyCopied ? (
                    <span className="flex items-center">
                      <PartyPopper className="h-4 w-4 mr-2" />
                      Copied!
                    </span>
                  ) : (
                    <span className="flex items-center">
                      <Copy className="h-4 w-4 mr-2" />
                      Copy Policy
                    </span>
                  )}
                </Button>
              </div>
            </CardHeader>

            <CardContent>
              <div className="rounded-md border">
                {isJsonString(policyEditable) ? (
                  <TextareaAutosize
                    ref={textareaRef}
                    value={policyEditable}
                    onChange={(e) => {
                      setPolicyEditable(e.target.value);
                      policyApplied && setPolicyApplied(false);
                      policyCopied && setPolicyCopied(false);
                    }}
                    minRows={4}
                    maxRows={20}
                    spellCheck={false}
                    className="border-blue-500 resize-none p-2"
                  />
                ) : (
                  <pre className="whitespace-pre-wrap break-words bg-gray-900 text-gray-100 p-6 rounded font-mono text-sm leading-relaxed overflow-x-auto">{policyEditable}</pre>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ––––––––––––––– Chat Response ––––––––––––––– */}
      {chatResponse && (
        <div>
          <Card>
            <CardHeader className="output-header pb-2">
              <CardTitle className="font-semibold text-[#4285F4]">Chat Response</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-60">
                <pre className="whitespace-pre-wrap break-words bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 p-6 rounded border border-blue-500 font-mono text-sm leading-relaxed overflow-x-auto">
                  {chatResponse}
                </pre>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default ResponseContainer;