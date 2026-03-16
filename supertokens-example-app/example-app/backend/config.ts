import EmailPassword from "supertokens-node/recipe/emailpassword";
import ThirdParty from "supertokens-node/recipe/thirdparty";
import type { ProviderInput } from "supertokens-node/recipe/thirdparty/types";
import Session from "supertokens-node/recipe/session";
import Dashboard from "supertokens-node/recipe/dashboard";
import UserRoles from "supertokens-node/recipe/userroles";
import MultiFactorAuth from "supertokens-node/recipe/multifactorauth";
import EmailVerification from "supertokens-node/recipe/emailverification";
import AccountLinking from "supertokens-node/recipe/accountlinking";
import Passwordless from "supertokens-node/recipe/passwordless";
import type { AccountInfoWithRecipeId } from "supertokens-node/recipe/accountlinking/types";
import type { User } from "supertokens-node/types";
import type { TypeInput } from "supertokens-node/types";

export function getApiDomain() {
    const apiPort = 3001;
    const apiUrl = `http://localhost:${apiPort}`;
    return apiUrl;
}

export function getWebsiteDomain() {
    const websitePort = 3000;
    const websiteUrl = `http://localhost:${websitePort}`;
    return websiteUrl;
}

export const SuperTokensConfig: TypeInput = {
    supertokens: {
        connectionURI: "https://try.supertokens.com",
    },
    appInfo: {
        appName: "SuperTokens Demo App",
        apiDomain: getApiDomain(),
        websiteDomain: getWebsiteDomain(),
        apiBasePath: "/auth", 
        websiteBasePath: "/auth", 
    },
    recipeList: [
        EmailPassword.init(),
        ThirdParty.init({
            signInAndUpFeature: {
                providers: [
                    {
                        config: {
                            thirdPartyId: "github",
                            clients: [
                                {
                                    clientId: "467101b197249757c71f",
                                    clientSecret: "e97051221f4b6426e8fe8d51486396703012f5bd",
                                    
                                },
                            ],
                        },
                    }
                ],
            },
        }),
        Dashboard.init(),
        UserRoles.init(),
        MultiFactorAuth.init({
    firstFactors: ["emailpassword", "otp-email", "otp-phone", "thirdparty"],
    override: {
        functions: (oI) => ({
            ...oI,
            getMFARequirementsForAuth: async () => [
                {
                    oneOf: [
                        MultiFactorAuth.FactorIds.OTP_EMAIL,
                        MultiFactorAuth.FactorIds.OTP_PHONE
                    ],
                },
            ],
        }),
    }
}),
        EmailVerification.init({
        mode: "REQUIRED"
    }),
        AccountLinking.init({
            shouldDoAutomaticAccountLinking: async (
                newAccountInfo: AccountInfoWithRecipeId,
                user: User | undefined,
                session: any,
                tenantId: string,
                userContext: any
            ) => {
                return {
                    shouldAutomaticallyLink: true,
                    shouldRequireVerification: true
                };
            }
        }),
        Passwordless.init({
    contactMethod: "EMAIL_OR_PHONE",
    flowType: "USER_INPUT_CODE"
}),
        Session.init()
    ],
};