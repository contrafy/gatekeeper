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
        const backendUrl = import.meta.env.BACKEND_BASE_URL || "http://localhost:8000";
        const res = await fetch(`${backendUrl}/generate_policy`, {
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
      console.log("Error generating policy:", e);
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

            {/* ------ big button / animations ------- */}
            <div className="flex items-center justify-center" style={{ minHeight: "60px" }}>
              <AnimatePresence mode="wait">
              {showLoadingAnimation ? (
                <motion.div
                key="loading"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.2 }}
                >
                <Button
                  variant="secondary"
                  type="submit"
                  disabled={true}
                  className="bg-[#F4B400] text-black hover:bg-[#E5A800]"
                >
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Processing…
                </Button>
                </motion.div>
              ) : policyGenerated ? (
                <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.2 }}
                >
                <Button
                  variant="default"
                  type="submit"
                  disabled={loading}
                  className="bg-green-600 text-white hover:bg-green-700"
                >
                  <Sparkles className="h-4 w-4 mr-2" /> Generate New Policy
                </Button>
                </motion.div>
              ) : policyGenerationFailed ? (
                <motion.div
                key="error"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.2 }}
                >
                <Button
                  variant="destructive"
                  type="submit"
                  disabled={loading}
                  className="bg-red-600 text-white hover:bg-red-700"
                >
                  <RefreshCw className="h-4 w-4 mr-2" /> Try Again
                </Button>
                </motion.div>
              ) : (
                <motion.div
                key="default"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.2 }}
                >
                <Button
                  variant="secondary"
                  type="submit"
                  disabled={loading}
                  className="custom-blue-hover"
                >
                  <Sparkles className="h-4 w-4 mr-2" /> Generate Policy
                </Button>
                </motion.div>
              )}
              </AnimatePresence>
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