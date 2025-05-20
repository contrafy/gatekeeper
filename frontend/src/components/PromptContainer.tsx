// PromptContainer.tsx  – now fully self‑contained
import React, { useState, FormEvent } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import TextareaAutosize from "react-textarea-autosize";
import {
  RefreshCw,
  Sparkles,
  AlertTriangle,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface ResultPayload {
  policy: string;
  chatResponse: string;
  previousPrompt: string;
  showPolicyAnimation: boolean;
}

interface PromptProps {
  /** one tiny prop – the place to push results up */
  onResult: (data: ResultPayload) => void;
}

const PromptContainer: React.FC<PromptProps> = ({ onResult }) => {
  /* ---------------- private state & helpers ---------------- */
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [showLoadingAnimation, setShowLoadingAnimation] = useState(false);
  const [policyGenerated, setPolicyGenerated] = useState(false);
  const [policyGenerationFailed, setPolicyGenerationFailed] = useState(false);
  const [emptyPromptShake, setEmptyPromptShake] = useState(false);
  const [error, setError] = useState("");

  /*
  const handleReset = () => {
    setPrompt("");
    setPolicyGenerated(false);
    setPolicyGenerationFailed(false);
    setError("");
  };
  */

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!prompt.trim()) {
      setEmptyPromptShake(true);
      setTimeout(() => setEmptyPromptShake(false), 820);
      return;
    }

    setLoading(true);
    setShowLoadingAnimation(true);
    setPolicyGenerated(false);
    setPolicyGenerationFailed(false);
    setError("");

    try {
      const res = await fetch("http://localhost:8000/generate_policy", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ prompt }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      /* ---- parse the backend payload exactly like before --- */
      let policy      = "";
      let chatText    = "";
      const full      = data.policy;
      const chatFromB = data.chat_response ?? "";

      if (full) {
        const jStart = full.indexOf("{");
        const jEnd   = full.lastIndexOf("}") + 1;
        if (jStart !== -1 && jEnd !== -1) {
          try {
            const obj = JSON.parse(full.substring(jStart, jEnd));
            policy   = JSON.stringify(obj, null, 2);
            chatText = chatFromB || full.substring(0, jStart).replace(/```json|```/g, "");
          } catch {
            policyGenerationFailed && setPolicyGenerationFailed(true);
          }
        }
      }

      if (!policy) {
        chatText = chatFromB || full?.replace(/```json|```/g, "") || "";
      }

      setPolicyGenerated(!policyGenerationFailed);
      setError("");

      // bubble everything up:
      onResult({
        policy,
        chatResponse: chatText,
        previousPrompt: prompt,
        showPolicyAnimation: true,
      });
    } catch (e) {
      setError("Failed to generate policy. Please try again.");
      setPolicyGenerationFailed(true);
    } finally {
      setLoading(false);
      setTimeout(() => setShowLoadingAnimation(false), 400);
    }
  };

  /* --------------------------- UI -------------------------- */
  return (
    <>
      <Card className="text-left space-y-4">
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col space-y-4">
            <div className={emptyPromptShake ? "shake-animation" : ""}>
              <TextareaAutosize
                placeholder="Describe your IAM policy requirements in plain English..."
                value={prompt}
                onChange={(e) => {
                  setPrompt(e.target.value);
                  policyGenerated && setPolicyGenerated(false);
                  policyGenerationFailed && setPolicyGenerationFailed(false);
                }}
                minRows={1}
                maxRows={5}
                className="prompt-input"
                style={{ borderColor: "#4285F4" }}
              />
            </div>

            {/* ------ big button / animations (unchanged) ------- */}
            <div className="flex items-center justify-center" style={{ minHeight: "60px" }}>
              {showLoadingAnimation ? (
                /* ... identical loading markup ... */
                <motion.div /* … same as before … */ />
              ) : policyGenerated ? (
                <motion.div /* success pill */ />
              ) : policyGenerationFailed ? (
                <motion.div /* failed pill + reset btn */ />
              ) : (
                <Button
                  variant="secondary"
                  type="submit"
                  disabled={loading}
                  className={
                    loading ? "bg-[#F4B400] text-black hover:bg-[#E5A800]" : "custom-blue-hover"
                  }
                >
                  {loading && !showLoadingAnimation ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Processing…
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 mr-2" /> Generate Policy
                    </>
                  )}
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Error banner (kept local) */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
          >
            <Alert variant="destructive" className="mt-4 mb-2 border-[#DB4437]">
              <AlertDescription className="flex items-center">
                <AlertTriangle className="h-4 w-4 mr-2 text-[#DB4437]" />
                {error}
              </AlertDescription>
            </Alert>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default PromptContainer;