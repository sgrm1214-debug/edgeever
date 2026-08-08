import { useQuery } from "@tanstack/react-query";
import type { createEdgeEverClient } from "@edgeever/client";
import { useMemo } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, View } from "react-native";
import { FileText, LayoutTemplate, X } from "./icons";
import { Text } from "./LocalizedText";
import {
  getMobileBuiltInTemplates,
  mobileTemplateToCreateSeed,
  toMobileSelectableTemplate,
  type MobileCreateMemoSeed,
  type MobileSelectableTemplate,
  type MobileSupportedLocale,
} from "../lib/mobile-templates";
import { useMobileLocale } from "../lib/mobile-locale";
import { styles } from "../screens/workspace-styles";

type MobileClient = ReturnType<typeof createEdgeEverClient>;

export const MobileTemplatePickerModal = ({
  bottomOffset = 0,
  client,
  onClose,
  onSelect,
  visible,
}: {
  bottomOffset?: number;
  client: MobileClient | null;
  onClose: () => void;
  onSelect: (seed: MobileCreateMemoSeed) => void;
  visible: boolean;
}) => {
  const { resolvedLocale, translate } = useMobileLocale();
  const builtInTemplates = useMemo(
    () => getMobileBuiltInTemplates(resolvedLocale as MobileSupportedLocale).map((template) => toMobileSelectableTemplate(template, "builtin")),
    [resolvedLocale]
  );

  const savedTemplatesQuery = useQuery({
    queryKey: ["mobile", "templates"],
    enabled: visible && Boolean(client),
    queryFn: async () => {
      if (!client) {
        return [] as MobileSelectableTemplate[];
      }
      const response = await client.listTemplates();
      return response.templates.map((template) => toMobileSelectableTemplate(template, "saved"));
    },
    staleTime: 30_000,
  });

  const savedTemplates = savedTemplatesQuery.data ?? [];
  const isLoadingSaved = savedTemplatesQuery.isLoading || savedTemplatesQuery.isFetching;

  const handleSelect = (template: MobileSelectableTemplate) => {
    onSelect(mobileTemplateToCreateSeed(template));
    onClose();
  };

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <Pressable onPress={onClose} style={[styles.actionSheetBackdrop, { paddingBottom: bottomOffset }]}>
        <Pressable style={[styles.listActionSheet, styles.templatePickerSheet]} onPress={(event) => event.stopPropagation()}>
          <View style={styles.actionSheetHandle} />
          <View style={styles.listActionSheetHeader}>
            <View style={styles.listActionSheetHeaderText}>
              <Text numberOfLines={1} style={styles.actionSheetTitle}>{translate("从模板新建")}</Text>
              <Text numberOfLines={2} style={styles.actionSheetSubtitle}>
                {translate("选择预设结构快速开始，也可使用网页端保存的自定义模板。")}
              </Text>
            </View>
            <Pressable accessibilityLabel={translate("关闭")} accessibilityRole="button" onPress={onClose} style={styles.sheetCloseButton}>
              <X color="#0f172a" size={18} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.listActionSheetContent} style={styles.listActionSheetScroll}>
            <Text style={styles.actionSheetSectionTitle}>{translate("我的自定义模板")}</Text>
            {isLoadingSaved ? (
              <View style={styles.templatePickerLoading}>
                <ActivityIndicator color="#0f172a" size="small" />
                <Text style={styles.mutedText}>{translate("正在加载模板")}</Text>
              </View>
            ) : null}
            {!isLoadingSaved && savedTemplatesQuery.isError ? (
              <Text style={styles.templatePickerHint}>
                {translate("自定义模板暂时无法加载，仍可使用下方内置模板。")}
              </Text>
            ) : null}
            {!isLoadingSaved && !savedTemplatesQuery.isError && savedTemplates.length === 0 ? (
              <Text style={styles.templatePickerHint}>
                {translate("暂无自定义模板。可在网页端将常用笔记另存为模板。")}
              </Text>
            ) : null}
            {savedTemplates.map((template) => (
              <TemplateRow key={`saved-${template.id}`} onPress={() => handleSelect(template)} template={template} />
            ))}

            <View style={styles.listActionDivider} />
            <Text style={styles.actionSheetSectionTitle}>{translate("内置推荐模板")}</Text>
            {builtInTemplates.map((template) => (
              <TemplateRow key={`builtin-${template.id}`} onPress={() => handleSelect(template)} template={template} />
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

export const MobileCreateChoiceModal = ({
  bottomOffset = 0,
  canCreate,
  onBlank,
  onClose,
  onTemplate,
  visible,
}: {
  bottomOffset?: number;
  canCreate: boolean;
  onBlank: () => void;
  onClose: () => void;
  onTemplate: () => void;
  visible: boolean;
}) => {
  const { translate } = useMobileLocale();
  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <Pressable onPress={onClose} style={[styles.actionSheetBackdrop, { paddingBottom: bottomOffset }]}>
        <Pressable style={styles.listActionSheet} onPress={(event) => event.stopPropagation()}>
          <View style={styles.actionSheetHandle} />
          <View style={styles.listActionSheetHeader}>
            <View style={styles.listActionSheetHeaderText}>
              <Text numberOfLines={1} style={styles.actionSheetTitle}>{translate("新建笔记")}</Text>
              <Text numberOfLines={1} style={styles.actionSheetSubtitle}>{translate("选择创建方式")}</Text>
            </View>
            <Pressable accessibilityLabel={translate("关闭")} accessibilityRole="button" onPress={onClose} style={styles.sheetCloseButton}>
              <X color="#0f172a" size={18} />
            </Pressable>
          </View>
          <View style={styles.listActionSheetContent}>
            <Pressable
              accessibilityRole="button"
              disabled={!canCreate}
              onPress={() => {
                onClose();
                onBlank();
              }}
              style={[styles.templateChoiceRow, !canCreate && styles.templateChoiceRowDisabled]}
            >
              <View style={styles.templateChoiceIcon}>
                <FileText color="#0f172a" size={18} />
              </View>
              <View style={styles.templateChoiceText}>
                <Text style={styles.templateChoiceTitle}>{translate("空白笔记")}</Text>
                <Text style={styles.templateChoiceDescription}>{translate("从空白页开始记录")}</Text>
              </View>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={!canCreate}
              onPress={() => {
                onClose();
                onTemplate();
              }}
              style={[styles.templateChoiceRow, !canCreate && styles.templateChoiceRowDisabled]}
            >
              <View style={styles.templateChoiceIcon}>
                <LayoutTemplate color="#0f172a" size={18} />
              </View>
              <View style={styles.templateChoiceText}>
                <Text style={styles.templateChoiceTitle}>{translate("从模板新建")}</Text>
                <Text style={styles.templateChoiceDescription}>{translate("使用会议纪要、周报等预设结构")}</Text>
              </View>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const TemplateRow = ({
  onPress,
  template,
}: {
  onPress: () => void;
  template: MobileSelectableTemplate;
}) => {
  const { translate } = useMobileLocale();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.templateRow}>
      <View style={styles.templateRowIcon}>
        <LayoutTemplate color="#047857" size={16} />
      </View>
      <View style={styles.templateRowText}>
        <View style={styles.templateRowTitleRow}>
          <Text numberOfLines={1} style={styles.templateRowTitle}>{template.name}</Text>
          <View style={[styles.templateBadge, template.source === "saved" ? styles.templateBadgeCustom : styles.templateBadgeBuiltIn]}>
            <Text style={[styles.templateBadgeText, template.source === "saved" ? styles.templateBadgeTextCustom : styles.templateBadgeTextBuiltIn]}>
              {template.source === "saved" ? translate("自定义") : translate("内置")}
            </Text>
          </View>
        </View>
        {template.description ? (
          <Text numberOfLines={2} style={styles.templateRowDescription}>{template.description}</Text>
        ) : null}
      </View>
    </Pressable>
  );
};
