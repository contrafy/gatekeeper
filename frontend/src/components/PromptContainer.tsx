// PromptContainer.tsx
import React, { FormEvent } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import TextareaAutosize from "react-textarea-autosize";
import { Loader2, RefreshCw, Sparkles, CheckCircle, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface PromptContainerProps {
  prompt: string;
  setPrompt: (val: string) => void;
  handleSubmit: (e: FormEvent<HTMLFormElement>) => void | Promise<void>;
  loading: boolean;
  showLoadingAnimation: boolean;
  policyGenerated: boolean;
  policyGenerationFailed: boolean;
  emptyPromptShake: boolean;
  setEmptyPromptShake: (v: boolean) => void;
  setPolicyGenerated: (v: boolean) => void;
  setPolicyGenerationFailed: (v: boolean) => void;
  error: string;
  handleReset: () => void;
}

const PromptContainer: React.FC<PromptContainerProps> = ({
  prompt,
  setPrompt,
  handleSubmit,
  loading,
  showLoadingAnimation,
  policyGenerated,
  policyGenerationFailed,
  emptyPromptShake,
  setEmptyPromptShake,
  setPolicyGenerated,
  setPolicyGenerationFailed,
  error,
  handleReset,
}) => (
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
                if (policyGenerated || policyGenerationFailed) {
                  setPolicyGenerated(false);
                  setPolicyGenerationFailed(false);
                }
              }}
              onFocus={() => {
                if (policyGenerated || policyGenerationFailed) {
                  setPolicyGenerated(false);
                  setPolicyGenerationFailed(false);
                }
              }}
              minRows={1}
              maxRows={5}
              className="prompt-input"
              style={{ borderColor: "#4285F4" }}
            />
          </div>

          <div className="flex items-center justify-center" style={{ minHeight: "60px" }}>
            {showLoadingAnimation ? (
              <motion.div
                className="loading-container"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.6, ease: "easeInOut" }}
              >
                <div className="loading-text">Generating Policy</div>
                <div className="flex items-center gap-2">
                  <Loader2 className="h-5 w-5 text-[#4285F4] loading-spinner" />
                  <div className="loading-circles">
                    <div className="loading-circle loading-circle-1" />
                    <div className="loading-circle loading-circle-2" />
                    <div className="loading-circle loading-circle-3" />
                    <div className="loading-circle loading-circle-4" />
                  </div>
                </div>
              </motion.div>
            ) : policyGenerated ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
                className="flex items-center justify-center px-4 py-2 rounded-md text-[#0F9D58] border border-[#0F9D58] bg-[#0F9D58]/10 cursor-not-allowed"
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                Policy Generated
              </motion.div>
            ) : policyGenerationFailed ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
                className="flex flex-col items-center gap-2"
              >
                <div className="text-sm text-[#DB4437] mb-1">
                  There was an issue with your prompt. Please review the chat response and try again.
                </div>
                <Button
                  variant="outline"
                  onClick={handleReset}
                  className="text-[#DB4437] border-[#DB4437] bg-[#DB4437]/10 hover:bg-[#DB4437]/20 hover:text-[#DB4437]"
                >
                  <AlertTriangle className="h-4 w-4 mr-2" />
                  Try Again
                </Button>
              </motion.div>
            ) : (
              <Button
                variant="secondary"
                type="submit"
                disabled={loading}
                className={loading ? "bg-[#F4B400] text-black hover:bg-[#E5A800]" : "custom-blue-hover"}
              >
                {loading && !showLoadingAnimation ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Processing...
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

    {error && (
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
        >
          <Alert variant="destructive" className="mt-4 mb-2 border-[#DB4437]">
            <AlertDescription className="flex items-center">
              <AlertTriangle className="h-4 w-4 mr-2 text-[#DB4437]" />
              {error}
            </AlertDescription>
          </Alert>
        </motion.div>
      </AnimatePresence>
    )}
  </>
);

export default PromptContainer;