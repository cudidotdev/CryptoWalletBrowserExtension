import { nanoid } from "nanoid";
import { NextPageX } from "types/next";
import { shorten } from "utils/string";
import blockies from "ethereum-blockies";
import { gasPriceFixedValue, TX_STATUS, TX_TYPE } from "constants/digits";
import { sendTxn, signNativeTokenTx, sendERC20Token } from "utils/transactions";
import { primaryFixedValue } from "constants/digits";
import { IAccount } from "interfaces/IAccount";
import { NETWORKS } from "interfaces/IRpc";
import { getCoinUSD } from "utils/priceFeed";
import { convertToWei, getGasPrice } from "utils/tools";
import { getWalletBalanceEth } from "utils/wallet";
import { ProviderContext } from "context/web3";
import {
  ClockFillIcon,
  ClockIcon,
  CloseIcon,
  TickHeavyIcon,
} from "@/components/icons/accessibility";
import { ArrowBack, ArrowForward, ArrowDown } from "@/components/icons/arrows";
import React, {
  ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AccountContext } from "@/context/account";
import { NetworkContext } from "@/context/network";
import NET_CONFIG from "config/allNet";
import Notification, { useNotification } from "components/notification";
import NetworkSelector, {
  networkLogoMap,
} from "page_components/wallet/network_selector";
import { LoaderContext } from "context/loader";
import Image from "next/image";

import { useRouter } from "next/router";
import Link from "next/link";
import TokenValue from "page_components/wallet/token_value";
import TransactionHistory from "page_components/wallet/transaction_history";
import { AssetProviderContext } from "context/web3/assets";
import { fetchWalletAssets } from "utils/assetEngine";
import { Notifier } from "utils/notifications";
import { Priority, details, Priories } from "types/gas";
import { priorities } from "constants/gas";
import BackButton from "@/components/button/back";
import { addressAvatar } from "@/utils/avatar";

export default function SendWalletPage() {
  const [account, setAccount] = useContext(AccountContext);
  const [provider] = useContext(ProviderContext);
  const [currentNetwork] = useContext(NetworkContext);
  const [notification, pushNotification] = useNotification();
  const [network] = useContext(NetworkContext);
  const [assets] = useContext(AssetProviderContext);
  const [currentToken, setCurrentToken] = useState<any>();
  const [currentTxId, setCurrentTxId] = useState<string>();
  const router = useRouter();

  const isNotNative = !!currentToken && !!router.query.token;

  const [startLoader, stopLoader] = useContext(LoaderContext);
  const [, setAssetProvider] = useContext(AssetProviderContext);

  const [gasPrice, setGasPrice] = useState("0");
  const [details, setDetails] = useState({
    currency: (router.query.token as string) || network.nativeCurrency.symbol,
    amount: "0",
    address: "",
    gasLimit: "21000",
    addData: "",
  });

  const [addressValid, setAddressValid] = useState({ value: true, msg: "" });
  const [amountValid, setAmountValid] = useState({ value: true, msg: "" });
  const [gasLimitValid, setGasLimitValid] = useState({ value: true, msg: "" });
  const [txHash, setTxHash] = useState(currentNetwork.blockExplorer);

  const [transConfirmModalActive, setTransConfirmModalActive] = useState(false);
  const [transInitModalActive, setTransInitModalActive] = useState(false);
  const [transFee, setTransFee] = useState(false);
  const [infoModal, setInfoModal] = useState(false);
  const [gasPriority, setGasPriority] = useState({} as Priority);

  const [networkClick, setNetworkClick] = useState(false);

  const sendNative = async (e: any) => {
    e.preventDefault();

    startLoader();
    setTransConfirmModalActive(false);
    resetDetails();

    try {
      const tx = isNotNative
        ? await sendERC20Token(
            provider,
            details.amount,
            currentToken.token.decimals,
            details.address,
            account.address,
            account.privateKey,
            gasPriority.id,
            Number(details.gasLimit),
            currentToken.token.contractAddress
          )
        : await signNativeTokenTx(
            provider,
            details.amount,
            currentNetwork.nativeCurrency.decimals,
            details.address,
            account.address,
            account.privateKey,
            gasPriority.id,
            Number(details.gasLimit)
          );

      const nonce = nanoid();

      setCurrentTxId(nonce);

      Notifier.create(nonce, {
        id: nonce,
        from: account.address,
        to: account.address,
        txHash: tx.transactionHash!,
        amount: +details.amount,
        gasPrice: +gasPrice,
        gasLimit: +details.gasLimit,
        status: TX_STATUS.PENDING,
        time: Date.now(),
        direction: TX_TYPE.OUT,
        chain: currentNetwork.chainName,
        txLink: `${currentNetwork.blockExplorer}/tx/${tx.transactionHash}`,
      });

      setTxHash(`${currentNetwork.blockExplorer}/tx/${tx.transactionHash}`);

      setTransInitModalActive(true);

      await sendTxn(provider, tx);

      Notifier.update(nonce, TX_STATUS.SUCCESS);

      const walletAssets = await fetchWalletAssets(
        account.address,
        network.chainId
      );

      const balance = Number(
        await getWalletBalanceEth(provider, account.address)
      );

      const balanceFiat = Number(
        (balance <= 0
          ? 0
          : (
              await getCoinUSD(
                NET_CONFIG[currentNetwork.chainName as NETWORKS].nativeCurrency
                  .symbol
              )
            ).value! * balance
        ).toFixed(primaryFixedValue)
      );

      setAccount((prev: IAccount) => ({
        ...prev,

        balance: balance,

        balanceFiat,
      }));

      setAssetProvider(walletAssets);

      pushNotification({
        element: "Transaction Successful",
        type: "success",
      });
    } catch (error: any) {
      console.log(error);

      Notifier.update(currentTxId!, TX_STATUS.FAILED);

      stopLoader();

      pushNotification({
        element: error.message,
        type: "error",
      });
    }

    stopLoader();
    setTransConfirmModalActive(false);
  };

  function resetDetails() {
    setDetails({
      currency: (router.query.token as string) || network.nativeCurrency.symbol,
      amount: "0",
      address: "",
      gasLimit: "21000",
      addData: "",
    });
  }

  useEffect(() => {
    setGasPriority(priorities[account.gasPriority]);
  }, []);

  useEffect(() => {
    console.log(details.amount, network.nativeCurrency.decimals);
    (async () => {
      try {
        if (details.address && details.amount) {
          const gasFee = await getGasPrice(
            provider,
            {
              to: details.address || account.address,
              from: account.address,
              value: convertToWei(
                details.amount,
                network.nativeCurrency.decimals
              ),
            },
            network.nativeCurrency.decimals
          );

          setGasPrice(gasFee.toFixed(gasPriceFixedValue));
        }
      } catch (error: any) {
        console.log(error.message);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [details, gasPriority]);

  useEffect(() => {
    if (assets.length) {
      setCurrentToken(
        assets.find((e: any) => e.token?.symbol === router.query.token)
      );
    }
  }, [assets, router.query]);

  //details validation
  useEffect(() => {
    //address validation
    if (details.address.length && !provider.utils.isAddress(details.address))
      setAddressValid({ value: false, msg: "Not a valid address" });
    else setAddressValid({ value: true, msg: "" });

    //amount validation
    if (isNaN(Number(details.amount)))
      setAmountValid({ value: false, msg: "Enter a valid number" });
    else if (+details.amount <= 0)
      setAmountValid({
        value: false,
        msg: "Enter valid amount",
      });
    else if (
      (!isNotNative && +details.amount + +gasPrice > account.balance) ||
      +details.amount > +currentToken?.value ||
      +gasPrice > account.balance
    )
      setAmountValid({
        value: false,
        msg: "Total transaction cost is less than balance",
      });
    else setAmountValid({ value: true, msg: "" });

    //gas limit validation
    if (isNaN(Number(details.gasLimit)))
      setGasLimitValid({ value: false, msg: "Enter a valid number" });
    else if (+details.gasLimit < 21000)
      setGasLimitValid({
        value: false,
        msg: "Gas limit should not be less than 21,000",
      });
    else setGasLimitValid({ value: true, msg: "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [details, account, gasPrice]);

  return (
    <div className="w-full flex flex-col gap-3">
      <TransConfirmModal
        active={transConfirmModalActive}
        setActive={setTransConfirmModalActive}
        details={details}
        gasPrice={gasPrice}
        sendToken={sendNative}
      />
      <TransInitModal
        txHash={txHash}
        active={transInitModalActive}
        setActive={setTransInitModalActive}
      />
      <TransFee
        gasPriority={gasPriority}
        priorities={priorities}
        active={transFee}
        setActive={setTransFee}
        setGasPriority={setGasPriority}
      />
      <InfoModal active={infoModal} setActive={setInfoModal} />

      <div className="py-2 px-4 sticky top-0 z-20 border-b border-neutral-300 bg-white">
        <h1 className="text-base text-center font-medium relative">
          <BackButton />
          Send Token
        </h1>
      </div>

      <div className="flex flex-col gap-3 px-3 pb-3">
        <div className="flex flex-col relative gap-0.5">
          <label className="font-semibold">Select Currency</label>
          <button
            className="h-11 px-4 rounded-lg border border-neutral-500 flex items-center"
            onClick={() => setNetworkClick(true)}
          >
            <span className="mr-4 relative bg-white rounded-full w-7 h-7 flex-shrink-0 flex">
              {currentToken?.token?.logo ? (
                <Image src={currentToken.token.logo} layout="fill" alt="" />
              ) : (
                networkLogoMap[network.chainName]
              )}
            </span>
            <span>
              {isNotNative
                ? details.currency
                : currentNetwork.nativeCurrency.symbol}
            </span>
          </button>
        </div>

        <div className="flex flex-col relative gap-0.5">
          <label className="font-semibold">Amount</label>
          <input
            className={`px-4 py-1.5 rounded-lg border border-neutral-500 flex items-center outline-none ring-2 ring-transparent focus:!ring-blue-600 focus:ring-offset-1 ${
              !amountValid.value ? "!ring-red-400" : ""
            }`}
            type="number"
            value={details.amount}
            onChange={(e) =>
              setDetails((prev) => ({
                ...prev,
                amount: e.target.value,
              }))
            }
          />
          {!amountValid.value && (
            <span className="text-red-500">{amountValid.msg}</span>
          )}
        </div>

        <div
          className={`flex flex-col relative gap-0.5 ${
            !addressValid.value ? "grouperror" : ""
          }`}
        >
          <label className="font-semibold">Address</label>
          <AddressInput address={details.address} setDetails={setDetails} />
        </div>
        {!addressValid.value && (
          <span className="text-red-500">{addressValid.msg}</span>
        )}

        <div>
          <h6 className="font-semibold">Transfer fee</h6>
          <div className="flex flex-col my-2 font-semibold">
            <div className="flex items-center">
              <div className="bg-neutral-300 flex items-center rounded-lg px-3 py-1 mr-3">
                <span>Bal: {account.balance}</span>
                <span className="flex items-center text-blue-700">
                  <span className="w-5 h-5 mr-1 ml-4 inline-flex text-blue-700">
                    <ClockFillIcon />
                  </span>
                  {gasPriority?.time}
                </span>
                <button
                  className="ml-2 text-blue-700 flex w-8 p-2 bg-transparent outline-none"
                  onClick={() => setTransFee(true)}
                >
                  <ArrowDown />
                </button>
              </div>
              {gasPrice}
            </div>
            <div className="mt-3">Total: {+details.amount + +gasPrice}</div>
          </div>
          <button
            className="text-blue-700 bg-transparent"
            onClick={() => setInfoModal(true)}
          >
            How fees are determined?
          </button>
        </div>

        <SendAdvancedSection
          hiddenComponent={
            <GasAndDataForm
              addData={details.addData}
              gasLimit={details.gasLimit}
              gasLimitValid={gasLimitValid}
              setDetails={setDetails}
            />
          }
        >
          <h6>Advanced</h6>
        </SendAdvancedSection>

        <div className="flex flex-col gap-4">
          <button
            onClick={resetDetails}
            className="p-2 bg-slate-100 rounded-lg text-blue-700 text-center font-semibold shadow-md shadow-blue-200"
          >
            Clear All
          </button>
          <button
            type="submit"
            className="p-2 bg-blue-700 rounded-lg text-white text-center font-semibold shadow-lg shadow-blue-200 disabled:cursor-not-allowed disabled:bg-blue-400"
            onClick={() => setTransConfirmModalActive(true)}
            disabled={
              !(
                gasLimitValid.value &&
                addressValid.value &&
                amountValid.value &&
                details.address
              )
            }
          >
            Next
          </button>
        </div>
        <Notification
          notification={notification}
          pushNotification={pushNotification}
        />
        <div className="flex flex-col gap-4 mt-8">
          <div>
            <NetworkSelector
              active={networkClick}
              setActive={setNetworkClick}
            />
          </div>
          <div>
            <TransactionHistory network={network.chainName} />
          </div>
        </div>
      </div>
    </div>
  );
}

function SendAdvancedSection({
  children,
  hiddenComponent,
}: {
  children: ReactNode;
  hiddenComponent: ReactNode;
}) {
  const [active, setActive] = useState(false);

  return (
    <div className={`p-2 bg-white shadow-a rounded-md`}>
      <div className="flex">
        <div className="flex items-center flex-grow flex-shrink w-full">
          {children}
        </div>
        <div className="flex items-center flex-grow flex-shrink w-full">
          <span>Gas limit and Data</span>
          <button
            className={`flex w-8 h-8 p-2 bg-transparent flex-shrink-0 transition ${
              active ? "rotate-180" : ""
            }`}
            onClick={() => setActive((prev) => !prev)}
          >
            <ArrowDown />
          </button>
        </div>
      </div>
      <div
        className={`overflow-hidden transition ${
          active ? "max-h-[100rem] duration-700" : "max-h-0 duration-300"
        } c-scroll`}
      >
        {hiddenComponent}
      </div>
    </div>
  );
}

function GasAndDataForm({
  addData,
  gasLimit,
  gasLimitValid,
  setDetails,
}: {
  addData: string;
  gasLimit: string;
  gasLimitValid: { value: boolean; msg: string };
  setDetails: React.Dispatch<React.SetStateAction<details>>;
}) {
  return (
    <div className="py-4 gap-4 flex flex-col">
      <div className="p-5 bg-neutral-300 rounded-lg">
        <h6 className="text-base font-semibold mb-1">
          For Advanced Users Only
        </h6>
        <p>
          Please don’t edit these fields unless you are an expert user & know
          what you’re doing. Entering the wrong information could result in your
          transaction failing or getting stuck.
        </p>
      </div>

      <div className="flex flex-col relative gap-0.5 px-1">
        <label className="font-semibold">Gas limit</label>
        <button
          className="text-blue-700 absolute right-2"
          onClick={() => setDetails((prev) => ({ ...prev, gasLimit: "21000" }))}
        >
          Reset to default: 21000
        </button>
        <input
          className={`px-4 py-1.5 rounded-lg border border-neutral-500 flex items-center outline-none ring-2 ring-offset-1 ring-transparent focus:ring-blue-500 ${
            !gasLimitValid.value ? "!ring-red-400" : ""
          }`}
          value={gasLimit}
          type="number"
          onChange={(e) =>
            setDetails((prev) => ({
              ...prev,
              gasLimit: e.target.value,
            }))
          }
        />
        {!gasLimitValid.value && (
          <span className="text-red-500">{gasLimitValid.msg}</span>
        )}
      </div>

      <div className="flex flex-col relative gap-0.5 px-1">
        <label className="font-semibold">Add Data</label>
        <input
          className={`px-4 py-1.5 rounded-lg outline-none border border-neutral-500 flex items-center focus:ring-2 ring-offset-1 ring-blue-500`}
          value={addData}
          onChange={(e) =>
            setDetails((prev) => ({ ...prev, addData: e.target.value }))
          }
        />
      </div>
    </div>
  );
}

function AddressInput({
  address,
  setDetails,
}: {
  address: string;
  setDetails: React.Dispatch<React.SetStateAction<details>>;
}) {
  const [account] = useContext(AccountContext);
  const [active, setActive] = useState(false);

  return (
    <div
      className={`rounded-md flex flex-col mt-1 border border-neutral-500 ${
        active
          ? "ring-2 ring-blue-500 group-[error]:ring-red-400 ring-offset-1"
          : ""
      }`}
      onFocusCapture={() => setActive(true)}
      onBlur={() => setActive(false)}
    >
      <div className="w-full py-1 px-2">
        <input
          value={address}
          onChange={(e) =>
            setDetails((prev) => ({ ...prev, address: e.target.value }))
          }
          className="outline-none flex w-full py-1"
        />
      </div>
      {!!account.addressList?.length && (
        <div
          className={`overflow-auto transition c-scroll ${
            active ? "max-h-[50rem] duration-800" : "max-h-0"
          }`}
        >
          <div className="p-1">
            {account.addressList?.map((e, i) => (
              <button
                key={i}
                onClick={() => {
                  setDetails((prev) => ({ ...prev, address: e.address }));
                  setActive(false);
                }}
                className="flex w-full bg-neutral-200 p-1 px-1.5 rounded-full items-center gap-2"
              >
                <Address address={e.address} nickname={e.nickname} />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Address({ address, nickname }: { address: string; nickname: string }) {
  const imageRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    imageRef.current?.lastChild &&
      imageRef.current.removeChild(imageRef.current.lastChild);
    imageRef.current?.appendChild(
      blockies.create({ seed: address, size: 10, scale: 4 })
    );
  }, [address]);

  return (
    <>
      <span
        ref={imageRef}
        className="rounded-full overflow-hidden w-10 h-10 flex-shrink-0 mr-2"
      ></span>
      <span className="flex flex-col items-start gap-1">
        <span>{shorten(nickname, 14, 0, 17)}</span>
        <span className="text-base">{shorten(address, 15, 6, 24)}</span>
      </span>
    </>
  );
}

function TransConfirmModal({
  active,
  setActive,
  details,
  gasPrice,
  sendToken,
}: {
  active: boolean;
  setActive: React.Dispatch<React.SetStateAction<boolean>>;
  details: details;
  gasPrice: string;
  sendToken: (e: any) => any;
}) {
  const [network] = useContext(NetworkContext);
  const [account] = useContext(AccountContext);
  const imageRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    imageRef.current?.lastChild &&
      imageRef.current.removeChild(imageRef.current.lastChild);
    imageRef.current?.appendChild(
      blockies.create({ seed: account.address, size: 10, scale: 3 })
    );
  }, [account.address]);

  return (
    <div
      className={`fixed top-0 left-0 bg-black bg-opacity-10 transition w-full h-full flex flex-col items-center p-2 ${
        active ? "opacity-1 z-40" : "opacity-0 -z-10"
      }`}
    >
      <div
        className={`bg-white shadow-b p-3 max-w-[20rem] max-h-[95%] overflow-x-hidden overflow-y-auto relative rounded-xl c-scroll`}
      >
        <button
          className="w-8 h-8 flex-shrink-0 absolute right-2 top-2 bg-transparent"
          type="button"
          onClick={() => setActive(false)}
        >
          <CloseIcon />
        </button>

        <h4 className="font-semibold p-2 text-base text-center w-full text-blue-700">
          TRANSACTION CONFIRMATION
        </h4>

        <p className="py-2">
          Please double check everything, mola team will not be able to reverse
          your transactions once it summited, you will still be charged gas fee
          even if the transaction fails.{" "}
          <Link href="#" className="text-blue-700">
            Learn More
          </Link>
        </p>
        <div className="flex">
          <div className="bg-neutral-200 w-full flex-grow flex-shrink p-3">
            <h6 className="font-semibold">SENDING</h6>
            <div className="my-2 flex font-semibold">
              <span className="bg-white rounded-full w-7 h-7 flex-shrink-0 flex items-center flex-center mr-2">
                {networkLogoMap[network.chainName]}
              </span>
              <div>
                <p>{details.amount}</p>
                <p>ALL 0</p>
              </div>
            </div>
          </div>
          <div className="mx-4 flex items-center">
            <span className="w-4 h-4 text-blue-700 flex flex-shrink-0">
              <ArrowForward />
            </span>
          </div>
          <div className="bg-neutral-200 w-full flex-grow flex-shrink p-3">
            <h6 className="font-semibold">TO ADDRESS</h6>
            <div className="my-2 flex font-semibold">
              <span
                className="bg-white rounded-full w-7 h-7 flex-shrink-0 flex items-center flex-center mr-2 overflow-hidden"
                ref={imageRef}
              ></span>
              <div>
                <p>Username</p>
                <p>{shorten(details.address, 8, 4, 15)}</p>
              </div>
            </div>
          </div>
        </div>
        <div style={{ margin: "2rem 0" }}>
          <div className="py-2 flex">
            <p className="w-1/2 font-semibold">TRANSACTION FEE</p>
            <p className="w-1/2 font-semibold">
              {Number(gasPrice).toFixed(10)}
            </p>
          </div>
          <div className="py-2 flex">
            <p>TOTAL</p>
            <p>{(+details.amount + +gasPrice).toFixed(10)}</p>
          </div>
        </div>
        <div className="text-base border-t border-b border-neutral-400">
          Transaction Details
        </div>
        <div className="flex flex-col gap-4 mt-4">
          <button
            className="p-2 bg-slate-100 rounded-lg text-blue-700 text-center font-semibold shadow-md shadow-blue-200"
            onClick={() => setActive(false)}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="p-2 bg-blue-700 rounded-lg text-white text-center font-semibold shadow-lg shadow-blue-200 disabled:cursor-not-allowed disabled:bg-blue-400"
            onClick={sendToken}
          >
            Confirm & Send
          </button>
        </div>
      </div>
    </div>
  );
}

function TransInitModal({
  active,
  setActive,
  txHash,
}: {
  txHash: string;
  active: boolean;
  setActive: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  return (
    <div
      className={`text-neutral-800 fixed top-0 left-0 bg-white bg-opacity-70 transition w-full h-full flex flex-col items-center p-2 ${
        active ? "opacity-1 z-40" : "-z-10 opacity-0"
      }`}
    >
      <div
        className={`bg-white shadow-b shadow-neutral-500 p-2 max-w-[20rem] w-full max-h-[95%] overflow-x-hidden overflow-y-auto relative rounded-xl c-scroll`}
      >
        <button
          className="w-8 h-8 flex-shrink-0 absolute right-2 top-2 bg-transparent"
          type="button"
          onClick={() => setActive(false)}
        >
          <CloseIcon />
        </button>

        <h4 className="font-semibold p-2 text-base text-center w-full text-blue-700">
          TRANSACTION INITIATED
        </h4>

        <div className="mx-auto w-32 my-8 text-blue-700">
          <TickHeavyIcon />
        </div>

        <div className="m-4">
          <p className="text-center">
            Ones completed the token amount will be deposited to the address you
            provided, this takes a few min depending on how conjested the
            etherum network is.
          </p>
        </div>
        <div className="my-4 mx-auto w-4/5 justify-between flex">
          <Link href={txHash} className="text-blue-700" target="_blank">
            View On Explorer
          </Link>
          <Link href="/wallet/notifications" className="text-blue-700">
            View Progress
          </Link>
        </div>
        <div className="flex justify-center mt-6 mb-1 gap-4">
          <button
            className={`bg-blue-700 text-white border-2 border-blue-600 rounded-md py-2 px-6 font-semibold w-60`}
            onClick={() => setActive(false)}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function TransFee({
  active,
  setActive,
  priorities,
  gasPriority,
  setGasPriority,
}: {
  active: boolean;
  priorities: Priories;
  gasPriority: Priority;
  setActive: React.Dispatch<React.SetStateAction<boolean>>;
  setGasPriority: React.Dispatch<React.SetStateAction<Priority>>;
}) {
  return (
    <div
      className={`fixed top-0 left-0 bg-black bg-opacity-10 transition w-full h-full flex flex-col items-center p-2 ${
        active ? "opacity-1 z-40" : "opacity-0 -z-10"
      }`}
    >
      <div
        className={`bg-white shadow-b p-3 max-w-[20rem] max-h-[95%] overflow-x-hidden overflow-y-auto rounded-xl c-scroll relative`}
      >
        <button
          className="w-8 h-8 flex-shrink-0 absolute right-2 top-2 bg-transparent"
          type="button"
          onClick={() => setActive(false)}
        >
          <CloseIcon />
        </button>

        <h4 className="font-semibold p-2 text-base text-center w-full text-blue-700">
          SELECT TRANSACTION FEE
        </h4>

        <div className="my-4 flex justify-center">
          <p className="text-center text-lg leading-snug w-4/5">
            The fee is charged by ethereum network and fluntuate depending on
            network traffic, mola does not profit from this fee.
          </p>
        </div>

        <div className="w-full">
          {Object.values(priorities).map((e, i) => {
            return (
              <button
                className={`flex items-center w-[calc(100%-0.6rem)] py-2 pr-1 pl-3 border focus:ring-2 ring-offset-1 ring-blue-500 border-neutral-200 rounded-md text-left transition my-3 mx-0.5 group ${
                  gasPriority.id == e.id ? "ring-2" : ""
                }`}
                key={i}
                onClick={() => {
                  setGasPriority(e);
                  setTimeout(() => setActive(false), 100);
                }}
              >
                <span className="w-5 h-5 flex-shrink-0 mr-5 inline-flex text-blue-700">
                  <e.icon />
                </span>
                <span className="w-full transition font-semibold group-focus:text-blue-700">
                  {e.text}
                </span>
                <span className="w-40 font-semibold text-blue-700 flex items-center">
                  <span className="inline-flex w-4 h-4 mr-2">
                    <ClockIcon />
                  </span>
                  <span>{e.time}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function InfoModal({
  active,
  setActive,
}: {
  active: boolean;
  setActive: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  return (
    <div
      className={`fixed top-0 left-0 bg-black bg-opacity-10 transition w-full h-full flex flex-col items-center p-2 ${
        active ? "opacity-1 z-40" : "opacity-0 -z-10"
      }`}
    >
      <div
        className={`bg-white shadow-b p-3 max-w-[20rem] max-h-[95%] overflow-x-hidden overflow-y-auto c-scroll relative rounded-xl`}
      >
        <button
          className="w-8 h-8 flex-shrink-0 absolute right-2 top-2 bg-transparent"
          type="button"
          onClick={() => setActive(false)}
        >
          <CloseIcon />
        </button>
        <div className="my-4">
          <h3 className="font-semibold text-2xl mb-2">
            How fees are determined
          </h3>
          <p>
            Ones completed the token amount will be deposited to the address you
            provided, this takes a few min depending on how conjested the
            etherum network is.
          </p>
        </div>
        <div className="my-4">
          <h3 className="font-semibold text-2xl mb-2">What should I do?</h3>
          <p>
            Good news! You have options! If you’re not in a hurry, you can use
            the “Normal” setting and your transaction will be mined at a later
            time. MEW supports Ethereum scaling solutions Polygon and Binance
            Smart Chain (accessible on MEW web and Android). Consider using
            these chains to avoid congestion and save on fees.
          </p>
        </div>
      </div>
    </div>
  );
}
