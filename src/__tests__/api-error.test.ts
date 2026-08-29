import { describe, it, expect } from "vitest";
import { describeApiError, isBillingError } from "../core/api-error";

/** The shape the Anthropic SDK throws: a status, and the parsed body. */
class FakeSdkError extends Error {
  constructor(
    readonly status: number,
    readonly error: unknown,
    message: string
  ) {
    super(message);
  }
}

describe("describeApiError", () => {
  it("unwraps the message from an Anthropic error body", () => {
    const details = describeApiError(
      new Error(
        '400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API."},"request_id":"req_1"}'
      )
    );

    expect(details.status).toBe(400);
    expect(details.message).toBe(
      "Your credit balance is too low to access the Anthropic API."
    );
  });

  it("prefers the parsed body an SDK error carries", () => {
    const details = describeApiError(
      new FakeSdkError(
        400,
        { type: "error", error: { type: "invalid_request_error", message: "Out of credit" } },
        "400 unparseable"
      )
    );

    expect(details.status).toBe(400);
    expect(details.message).toBe("Out of credit");
  });

  it("unwraps the message from an OpenAI-style body", () => {
    const details = describeApiError(
      new Error(
        'API request failed (429): {"error":{"message":"You exceeded your current quota, please check your plan and billing details.","type":"insufficient_quota","code":"insufficient_quota"}}'
      )
    );

    expect(details.status).toBe(429);
    expect(details.message).toBe(
      "You exceeded your current quota, please check your plan and billing details."
    );
  });

  it("unwraps the message from a Gemini-style body", () => {
    const details = describeApiError(
      new Error(
        'Gemini API request failed (429): {"error":{"code":429,"message":"Quota exceeded for your current plan.","status":"RESOURCE_EXHAUSTED"}}'
      )
    );

    expect(details.status).toBe(429);
    expect(details.message).toBe("Quota exceeded for your current plan.");
  });

  it("keeps the raw text when there is no JSON body", () => {
    const details = describeApiError(new Error("Network error"));

    expect(details.status).toBeUndefined();
    expect(details.message).toBe("Network error");
  });

  it("keeps the raw text when the body is malformed", () => {
    const raw = "API request failed (500): {not json";
    expect(describeApiError(new Error(raw)).message).toBe(raw);
  });

  it("handles a thrown non-Error", () => {
    expect(describeApiError("string error").message).toBe("string error");
    expect(describeApiError(undefined).message).toBe("undefined");
  });
});

describe("isBillingError", () => {
  const billing = [
    'Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.',
    'API request failed (429): {"error":{"message":"You exceeded your current quota.","code":"insufficient_quota"}}',
    'API request failed (400): {"error":{"code":"billing_hard_limit_reached","message":"Billing hard limit has been reached"}}',
    'Gemini API request failed (429): {"error":{"message":"You exceeded your current quota, please check your plan and billing details."}}',
    'Gemini API request failed (403): {"error":{"message":"This API method requires billing to be enabled. Please enable billing."}}',
    'API request failed (402): {"error":{"message":"Insufficient Balance"}}',
  ];

  it.each(billing)("flags %j as a billing failure", (raw) => {
    expect(isBillingError(describeApiError(new Error(raw)))).toBe(true);
  });

  const notBilling = [
    "Network error",
    'API request failed (401): {"error":{"message":"Incorrect API key provided","code":"invalid_api_key"}}',
    'API request failed (429): {"error":{"message":"Rate limit reached for gpt-5.6-sol in organization org-1 on requests per min. Please try again in 1s."}}',
    '429 {"type":"error","error":{"type":"rate_limit_error","message":"Number of request tokens has exceeded your per-minute rate limit."}}',
    'API request failed (529): {"error":{"message":"Overloaded"}}',
    'API request failed (404): {"error":{"message":"The model does not exist"}}',
  ];

  it.each(notBilling)("does not flag %j", (raw) => {
    expect(isBillingError(describeApiError(new Error(raw)))).toBe(false);
  });

  it("flags any 402 regardless of the body", () => {
    expect(
      isBillingError(describeApiError(new FakeSdkError(402, undefined, "402 nope")))
    ).toBe(true);
  });
});
