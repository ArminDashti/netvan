import type { NicVendorId } from "@/lib/nicVendor";
import intel from "@/assets/nic-vendors/intel.svg";
import realtek from "@/assets/nic-vendors/realtek.svg";
import qualcomm from "@/assets/nic-vendors/qualcomm.svg";
import broadcom from "@/assets/nic-vendors/broadcom.svg";
import mediatek from "@/assets/nic-vendors/mediatek.svg";
import killer from "@/assets/nic-vendors/killer.svg";
import microsoft from "@/assets/nic-vendors/microsoft.svg";
import marvell from "@/assets/nic-vendors/marvell.svg";
import atheros from "@/assets/nic-vendors/atheros.svg";
import tplink from "@/assets/nic-vendors/tplink.svg";
import cisco from "@/assets/nic-vendors/cisco.svg";
import vmware from "@/assets/nic-vendors/vmware.svg";
import virtualbox from "@/assets/nic-vendors/virtualbox.svg";
import hyperv from "@/assets/nic-vendors/hyperv.svg";
import samsung from "@/assets/nic-vendors/samsung.svg";
import apple from "@/assets/nic-vendors/apple.svg";

const LOGOS: Record<NicVendorId, string> = {
  intel,
  realtek,
  qualcomm,
  broadcom,
  mediatek,
  killer,
  microsoft,
  marvell,
  atheros,
  tplink,
  cisco,
  vmware,
  virtualbox,
  hyperv,
  samsung,
  apple,
};

export function NicVendorLogo({
  vendor,
  className,
}: {
  vendor: NicVendorId;
  className?: string;
}) {
  return (
    <img
      src={LOGOS[vendor]}
      alt={vendor}
      className={className}
      width={40}
      height={40}
      draggable={false}
    />
  );
}
