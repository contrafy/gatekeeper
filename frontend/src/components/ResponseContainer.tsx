// ResponseContainer.tsx
import React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import TextareaAutosize from "react-textarea-autosize";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, CheckCircle, Rocket, Copy, PartyPopper } from "lucide-react";

interface ResponseContainerProps {
  previousPrompt: string;
  policy: string;
  chatResponse: string;
  showPolicyAnimation: boolean;
  policyApplied: boolean;
  applyLoading: boolean;
  loading: boolean;
  token: string;
  selectedProject: string;
  handleApplyPolicy: () => void;
  handleCopy: () => void;
  policyCopied: boolean;
  handlePolicyChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  isJsonString: (str: string) => boolean;
}

const MotionDiv = motion.div;
const MotionButton = motion(Button);

const ResponseContainer: React.FC<ResponseContainerProps> = ({
  previousPrompt,
  policy,
  chatResponse,
  showPolicyAnimation,
  policyApplied,
  applyLoading,
  loading,
  token,
  selectedProject,
  handleApplyPolicy,
  handleCopy,
  policyCopied,
  handlePolicyChange,
  isJsonString,
}) => (
  <div className="response-container h-auto">
    {previousPrompt && (
      <div className="mb-2 text-left">
        <strong>Prompt:</strong> {previousPrompt}
      </div>
    )}

    {policy && (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{
          duration: 0.6,
          ease: [0.22, 1, 0.36, 1],
          delay: showPolicyAnimation ? 0.1 : 0,
        }}
      >
        <Card className="mb-4 policy-output">
          <CardHeader className="output-header pb-2">
            <CardTitle className="font-semibold text-[#0F9D58]">
              Generated Policy
            </CardTitle>
            <MotionDiv layout className="flex space-x-2">
              {policy && token && selectedProject && (
                <MotionButton
                  layout
                  variant="secondary"
                  onClick={handleApplyPolicy}
                  disabled={
                    loading ||
                    applyLoading ||
                    !token ||
                    !selectedProject ||
                    policyApplied
                  }
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
                        transition={{ duration: 0, ease: "easeInOut" }}
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
                        transition={{ duration: 0, ease: "easeInOut" }}
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
                        transition={{ duration: 0, ease: "easeInOut" }}
                        className="flex items-center"
                      >
                        <Rocket className="h-4 w-4 mr-2" />
                        Apply Policy
                      </motion.span>
                    )}
                  </AnimatePresence>
                </MotionButton>
              )}

              <MotionButton
                layout
                variant="secondary"
                onClick={handleCopy}
                disabled={loading || policyCopied}
                className="custom-orange-hover"
              >
                <AnimatePresence mode="popLayout">
                  {policyCopied ? (
                    <motion.span
                      key="copied"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0, ease: "easeInOut" }}
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
                      transition={{ duration: 0, ease: "easeInOut" }}
                      className="flex items-center"
                    >
                      <Copy className="h-4 w-4 mr-2" />
                      Copy Policy
                    </motion.span>
                  )}
                </AnimatePresence>
              </MotionButton>
            </MotionDiv>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              {isJsonString(policy) ? (
                <TextareaAutosize
                  className="policy-textbox w-full font-mono"
                  value={policy}
                  onChange={handlePolicyChange}
                  minRows={4}
                  maxRows={20}
                  spellCheck={false}
                  style={{ borderColor: "#4285F4", resize: "none", padding: "0.5rem" }}
                />
              ) : (
                <pre className="policy-pre">{policy}</pre>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    )}

    {chatResponse && (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{
          duration: 0.6,
          ease: [0.22, 1, 0.36, 1],
          delay: showPolicyAnimation ? 0.3 : 0,
        }}
      >
        <Card className="chat-output">
          <CardHeader className="output-header pb-2">
            <CardTitle className="font-semibold text-[#4285F4]">
              Chat Response
            </CardTitle>
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

export default ResponseContainer;