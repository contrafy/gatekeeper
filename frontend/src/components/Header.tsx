// Header.tsx
import React from "react";
import { CredentialResponse, GoogleLogin, GoogleOAuthProvider } from "@react-oauth/google";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Shield } from "lucide-react";
import { ModeToggle } from "./mode-toggle";

const CLIENT_ID = import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID;

interface HeaderProps {
  token: string;
  userPicture: string;
  userName: string;
  handleGoogleSuccess: (cred: CredentialResponse) => void;
  handleSignOut: () => void;
}

const Header: React.FC<HeaderProps> = ({
  token,
  userPicture,
  userName,
  handleGoogleSuccess,
  handleSignOut,
}) => (
  <header className="fixed top-0 w-full mb-5 border-b bg-white dark:bg-black">
    <div className="flex items-center justify-between w-full px-7.5 py-2">
      {/* Left side */}
      <div className="flex items-center space-x-2">
        <Shield className="h-5 w-5 text-[#4285F4]" />
        <div className="font-semibold text-[#202124] dark:text-white text-base">
          Google Cloud IAM Policy Generator
        </div>
      </div>

      {/* Right side */}
      <div className="flex items-center space-x-4">
        <ModeToggle />
        <GoogleOAuthProvider clientId={CLIENT_ID}>
          <div className="w-fit mx-auto">
            {token ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Avatar className="cursor-pointer">
                    <AvatarImage src={userPicture} alt="Profile" />
                    <AvatarFallback>Me</AvatarFallback>
                  </Avatar>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuLabel className="text-[#4285F4]">
                    Signed in as {userName}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
                    <DropdownMenuItem
                      className="cursor-pointer hover:bg-[#DB4437]/10 text-[#DB4437]"
                      onClick={handleSignOut}
                    >
                      Sign Out
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <div className="google-login-container dark:bg-gray-800 dark:border dark:border-gray-700 dark:rounded-full">
                <GoogleLogin
                  shape="circle"
                  onSuccess={(cred) => {
                    console.debug("oauth success:", cred);
                    handleGoogleSuccess(cred);
                  }}
                  onError={() => console.error("login failed")}
                />
              </div>
            )}
          </div>
        </GoogleOAuthProvider>
      </div>
    </div>
  </header>
);

export default Header;