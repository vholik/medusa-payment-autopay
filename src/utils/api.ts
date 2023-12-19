import axios from "axios";

export default function buildApi(baseURL: string) {
  const instance = axios.create({
    baseURL,
    headers: {
      BmHeader: "pay-bm-continue-transaction-url",
    },
  });

  return <T extends any>(url: string, body?: any) => {
    return instance.post<T>(url, body).then((res) => res.data);
  };
}
