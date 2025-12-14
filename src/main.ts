import { Notice, Plugin } from "obsidian";
import { DistillSettings } from "./types";
import { DEFAULT_SETTINGS } from "./settings";
import { DistillSettingsTab } from "./ui/SettingsTab";
import { UrlInputModal } from "./ui/UrlInputModal";

export default class DistillPlugin extends Plugin {
  settings: DistillSettings;

  async onload(): Promise<void> {
    await this.loadSettings();

    // Register main command
    this.addCommand({
      id: "distill-article",
      name: "Distill article from URL",
      callback: () => {
        this.distillArticle();
      },
    });

    // Add settings tab
    this.addSettingTab(new DistillSettingsTab(this.app, this));

    console.log("Distill loaded");
  }

  onunload(): void {
    console.log("Distill unloaded");
  }

  private distillArticle(): void {
    // Check for API key
    if (!this.settings.openRouterApiKey) {
      new Notice("Please configure your OpenRouter API key in Distill settings");
      return;
    }

    // Open URL input modal
    new UrlInputModal(this.app, this).open();
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
