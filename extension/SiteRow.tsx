import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@@/components/ui/item";
import { Switch } from "@@/components/ui/switch";

/** One site with its on/off switch; shared by the popup and the settings page. */
export default function SiteRow(props: {
  name: string;
  detail?: string;
  icon: IconSvgElement;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <Item variant="outline" size="sm">
      <ItemMedia variant="icon">
        <HugeiconsIcon icon={props.icon} aria-hidden />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>{props.name}</ItemTitle>
        {props.detail !== undefined && <ItemDescription>{props.detail}</ItemDescription>}
      </ItemContent>
      <ItemActions>
        <Switch
          aria-label={`Hide ads on ${props.name}`}
          checked={props.checked}
          onCheckedChange={props.onChange}
        />
      </ItemActions>
    </Item>
  );
}
