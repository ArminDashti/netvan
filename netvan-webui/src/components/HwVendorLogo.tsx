import type { HwVendorId } from "@/lib/hwVendor";
import intel from "@/assets/hw-vendors/intel.svg";
import amd from "@/assets/hw-vendors/amd.svg";
import nvidia from "@/assets/hw-vendors/nvidia.svg";
import samsung from "@/assets/hw-vendors/samsung.svg";
import skhynix from "@/assets/hw-vendors/skhynix.svg";
import micron from "@/assets/hw-vendors/micron.svg";
import kingston from "@/assets/hw-vendors/kingston.svg";
import crucial from "@/assets/hw-vendors/crucial.svg";
import wd from "@/assets/hw-vendors/wd.svg";
import seagate from "@/assets/hw-vendors/seagate.svg";
import toshiba from "@/assets/hw-vendors/toshiba.svg";
import kioxia from "@/assets/hw-vendors/kioxia.svg";
import asus from "@/assets/hw-vendors/asus.svg";
import msi from "@/assets/hw-vendors/msi.svg";
import gigabyte from "@/assets/hw-vendors/gigabyte.svg";
import asrock from "@/assets/hw-vendors/asrock.svg";
import corsair from "@/assets/hw-vendors/corsair.svg";
import apple from "@/assets/hw-vendors/apple.svg";
import qualcomm from "@/assets/hw-vendors/qualcomm.svg";
import microsoft from "@/assets/hw-vendors/microsoft.svg";
import generic from "@/assets/hw-vendors/generic.svg";

const LOGOS: Record<HwVendorId, string> = {
  intel,
  amd,
  nvidia,
  samsung,
  skhynix,
  micron,
  kingston,
  crucial,
  wd,
  seagate,
  toshiba,
  kioxia,
  asus,
  msi,
  gigabyte,
  asrock,
  corsair,
  apple,
  qualcomm,
  microsoft,
  generic,
};

export function HwVendorLogo({
  vendor,
  className,
}: {
  vendor: HwVendorId;
  className?: string;
}) {
  return (
    <img
      src={LOGOS[vendor]}
      alt={vendor}
      className={className}
      width={56}
      height={40}
      draggable={false}
    />
  );
}
