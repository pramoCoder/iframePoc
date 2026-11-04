import { act } from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import App from "./App";

const selectCustomer = (partyId) => {
  act(() => {
    window.dispatchEvent(
      new MessageEvent("message", {
        origin: "https://racv--iagiqa--c.sandbox.vf.force.com",
        data: {
          gwMessageType: "CUSTOMER_SELECTED",
          gwMessageId: "m-1",
          Name: "Alex Customer",
          gwPayload: { partyId },
        },
      })
    );
  });
};

test("loads the payment iframe only after a valid submit", () => {
  render(<App />);

  expect(screen.getByTitle("Search Iframe")).toBeInTheDocument();
  expect(screen.queryByTitle("Payment Iframe")).not.toBeInTheDocument();
  expect(screen.getByLabelText("amount (in cents)")).toHaveValue("117816");
  expect(screen.queryByLabelText("sessionId")).not.toBeInTheDocument();
  expect(screen.getByLabelText("customerId")).toHaveValue("");
  expect(screen.getByText("No Pay Now response yet...")).toBeInTheDocument();
  expect(screen.queryByText("Payment URL Payload (iframe load)")).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Submit" }));

  expect(screen.getByText("Select a customer from the search results.")).toBeInTheDocument();
  expect(screen.queryByTitle("Payment Iframe")).not.toBeInTheDocument();

  fireEvent.change(screen.getByLabelText("amount (in cents)"), {
    target: { name: "amount", value: "12.5" },
  });
  selectCustomer("PARTY-123");

  expect(screen.getByLabelText("customerId")).toHaveValue("PARTY-123");
  expect(screen.queryByTitle("Payment Iframe")).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Submit" }));

  expect(screen.getByText("amount must be a whole number of cents greater than zero.")).toBeInTheDocument();
  expect(screen.queryByTitle("Payment Iframe")).not.toBeInTheDocument();

  fireEvent.change(screen.getByLabelText("amount (in cents)"), {
    target: { name: "amount", value: "117816" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Submit" }));

  const paymentIframe = screen.getByTitle("Payment Iframe");
  const iframeUrl = paymentIframe.getAttribute("src");

  expect(iframeUrl).toContain("ExternalCustomerPaymentVF");
  expect(iframeUrl).toContain("customerId=PARTY-123");
  expect(iframeUrl).toContain("amount=117816");
  expect(iframeUrl).toContain("id=PARTY-123");
  expect(iframeUrl).toContain("brand=RACV");
  expect(iframeUrl).toContain("sessionId=774544f2-15a9-4bff-b8c8-78d5aac0bdad");
  expect(screen.queryByText("Payment URL Payload (iframe load)")).not.toBeInTheDocument();
  expect(
    screen.getByText("Complete payment in the iframe to receive the Pay Now response...")
  ).toBeInTheDocument();

  act(() => {
    window.dispatchEvent(
      new MessageEvent("message", {
        origin: "https://racv--iagiqa--c.sandbox.vf.force.com",
        data: {
          gwMessageType: "PAYMENT_URL_PAYLOAD",
          gwMessageId: "550e8400-e29b-41d4-a716-446655440000",
          gwPayload: {
            paymentStatus: "",
            policyNumber: "MOTV9000000010",
            quoteNumber: "QTEP4101694602",
            paymentAmount: "117816",
            receiptNumber: "",
            paymentNumber: "",
            sessionId: "774544f2-15a9-4bff-b8c8-78d5aac0bdad",
            correlationId: "550e8400-e29b-41d4-a716-446655440000",
          },
        },
      })
    );
  });

  expect(screen.getByLabelText("customerId")).toHaveValue("PARTY-123");
  expect(
    screen.queryByText("Unable to load payment setup: Guidewire Id is missing for this customer.")
  ).not.toBeInTheDocument();
});

test("rejects an invalid expiry and currency before rendering the payment iframe", () => {
  render(<App />);
  selectCustomer("PARTY-456");

  fireEvent.change(screen.getByLabelText("expiry"), {
    target: { name: "expiry", value: "08-10-2026" },
  });
  fireEvent.change(screen.getByLabelText("currency"), {
    target: { name: "currency", value: "aud" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Submit" }));

  expect(
    screen.getByText("expiry must be an ISO-8601 UTC timestamp, for example 2026-10-08T00:03:13.974Z.")
  ).toBeInTheDocument();
  expect(screen.getByText("currency must be a 3-letter code such as AUD.")).toBeInTheDocument();
  expect(screen.queryByTitle("Payment Iframe")).not.toBeInTheDocument();
  expect(within(screen.getByRole("alert")).getByText(/Fix the highlighted fields/)).toBeInTheDocument();
});
